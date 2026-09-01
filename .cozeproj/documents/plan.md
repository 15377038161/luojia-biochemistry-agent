# Coze 正式生产适配重构计划

## 概述

对现有生物化学实验智能体（Next.js 16 App Router + Supabase，Web 端）做一次正式的生产适配重构：以生产库**已存在**的 `202608140001_agent_core.sql` 数据结构为唯一正式数据模型，删除对一切生产库不存在对象（`session_mode`、`content_version_id`、`teacher_role_grants`、`content_drafts`、`grade_components`、`grade_review_requests`、`sync_outbox.external_record_id` 列、`start_or_resume_teacher_practice_session`、`refresh_grade_component` 等）的运行时依赖，统一改为 Coze 原生实现；同时修复 `/student/map` 报"智能体返回内容未通过校验"的故障、补齐四类错误分类、新增统一成绩计算模块与完整测试，最后提交推送并部署验证。全程不执行任何生产/开发库 DDL。

### 已核实的库内事实（只读探测，开发库 + 生产库双确认）

| 检查项 | 结果 |
|---|---|
| `teacher_role_grants` / `content_drafts` / `grade_components` / `grade_review_requests` | 开发、生产均**不存在** |
| `session_mode` 类型、`agent_sessions.session_mode` / `content_version_id` 列 | 均**不存在** |
| `sync_outbox.external_record_id` 列 | **不存在** |
| v2 系列函数（`start_or_resume_teacher_practice_session` / `refresh_grade_component` / `submit_grade_review` / `resolve_grade_review` / `pin_latest_content_version` / `suppress_practice_sync`） | 均**不存在** |
| 结论 | `202608230001_unified_agent_v2.sql` 与 `202608240001_chaoxing_sync_contract.sql` 从未在任何共享数据库执行 → 按用户指令**直接删除**这两份迁移文件并更新文档 |
| 生产故障根因 | `GET /api/student/session` 过滤 `.eq('session_mode','student')`（不存在的列）→ PostgREST 报错 → `errorFromUnknown` 兜底把数据库异常映射成 `AI_OUTPUT_INVALID`（"智能体返回内容未通过校验"） |

### 生产库 RLS 写策略边界（决定实现路径，无 DDL 可改）

| 表 | 用户客户端可写？ | 实现路径 |
|---|---|---|
| `agent_sessions` | 可（本人） | 用户客户端 |
| `agent_messages` | 可（本人会话） | 用户客户端 |
| `learning_reports` | 可（本人会话） | 用户客户端 / 现有 `record_learning_report` RPC |
| `teacher_reviews` | 可（授权教师） | 用户客户端 |
| `step_states` | **无 insert/update 策略** | service-role admin 客户端（服务端先校验归属） |
| `content_versions` | **仅教师可读，无写策略** | service-role admin 客户端 |
| `event_logs` | **无用户策略** | service-role admin 客户端 |
| `sync_outbox` | **无用户策略** | service-role admin 客户端（worker 现状） |

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| 数据模型 | 仅使用 `202608140001_agent_core.sql` 的表 + `start_or_resume_student_session` / `record_text_evaluation` / `record_learning_report` / `record_teacher_review` 四个既有 RPC | 生产不可执行 DDL，这是唯一正式模型 |
| 会话类型 | `agent_sessions.agent_role` 为唯一判别字段；学生统计全部显式 `agent_role='student'`，教师体验全部显式 `agent_role='teacher'` | 用户指定，禁止再碰 `session_mode` |
| 教师体验会话 | 服务端 service-role 原子创建：`agent_role='teacher'` 会话 + `current_step=1` + 8 条 `step_states`（第1步 active）+ system 初始化消息；已有未完成会话直接恢复 | `step_states` 无用户写策略；教师分析会话（`current_step=null`、无步骤）保持现状并用 `current_step IS NOT NULL` 与体验会话区分 |
| 教师体验隔离 | 评价/报告走服务端直写分支：不写 `sync_outbox`、不进统一成绩、不进班级统计 | 无 `suppress_practice_sync`，分支是唯一无 DDL 方案 |
| 内容版本 | `content_versions` 单表双态：`published_at IS NULL`=草稿、否则已发布；`manifest` 存 experiment/steps/rubrics/source_refs/editor_metadata/created_by/updated_by/status；发布只更新 `published_at` | 用户指定，替代 `content_drafts` |
| 会话内容快照 | 学生开始实验时写 `agent_messages` `kind='content_snapshot'`，`metadata` 存 content_version_id/content_version/source_hash；此后该会话恒读快照版本 | 教师发新版不改变历史实验 |
| 教师身份 | 登录入库时按稳定 roleId 白名单写 `profiles.role`（teacher/content_admin）+ `external_identities.raw_roles`；班级权限用 `enrollments` + `is_authorized_teacher(class_id)`；删除 `teacher_role_grants` 查询与其静默降级 | 用户指定；身份只信服务端持久化数据 |
| 成绩计算 | 新建唯一入口 `grading service`：由 `evaluations` + `step_states` + `teacher_reviews` 计算五维得分、八步得分、总分、完成度、待复核步骤、状态机（provisional/review_required/appealed/final）；成绩、看板、雷达图、报告、学习通同步全部消费它 | 禁止页面各算一套 |
| 分步报告 | 每步通过或进入复核即由评价结果生成独立分步学习报告（原始回答、AI 判断、正确部分、缺失部分、标准回答、推荐改写、知识点讲解、得分依据），纳入 `learning_reports.content.step_reports` | 用户指定 |
| 申诉复核 | `agent_messages`（kind='grade_review_request'/'grade_review_resolution'，metadata 含 request_id/report_id/reason/status）+ `teacher_reviews`（confirm/adjust/comment_only）+ `event_logs` + 调分生成新 `learning_reports` 版本（不覆盖旧版） | 用户指定，替代 `grade_review_requests` |
| 超星同步 | `sync_outbox.payload.external_record_id` 读写；成功后回写 `{external_record_id, submitted_at, readback_verified, readback_at}` | 用户指定，禁止碰独立列 |
| 错误分类 | 四类分离：`DB_ERROR`（透出 Supabase code+message、不含密钥）、`AUTH_*`、`AI_OUTPUT_INVALID`（仅真实 AI 输出结构错误，由专用 `AiValidationError` 携带）、网络/超时 | 数据库异常不再伪装成 AI 异常 |
| 代码组织 | 新增 `src/lib/services/`（sessions/content/grading/reviews）+ JSONB 类型与运行时校验；API 路由变薄壳，禁止重复拼 JSON | 用户工程要求 |
| 测试 | 沿用 `node:test` + `tsx`；DB 链路用"记录查询条件的 fake Supabase 客户端"断言 `agent_role` 过滤、null 归一等 | 14 项测试要求中可单测部分全覆盖 |
| 包管理/构建 | 仅 `pnpm`；`pnpm test` + `pnpm build`（含 ts-check、lint） | 项目规范 |

## 是否有原型设计

**否**。本项目为已多次交付的存量项目，本次是数据层/接口层生产适配重构与故障修复，无新增页面与导航；既有页面仅在现有组件结构内适配新数据字段（分步点评新增标准答案/推荐改写/知识点讲解展示、申诉面板适配新数据源）。

## 功能模块

### 1. 会话层（`src/lib/services/sessions.ts` + 两个 session 路由）
- 学生：`GET /api/student/session` 仅查 `agent_role='student'`、`completed_at is null`，`current_step` 一律 `Number(x) || 1`；无会话时 `POST` 走既有 `start_or_resume_student_session` RPC。
- 教师体验：`/api/teacher/practice-session` 服务端原子创建/恢复（见技术方案），恢复条件 `agent_role='teacher' AND completed_at IS NULL AND current_step IS NOT NULL`。
- 教师分析会话 `/api/teacher/session` 保持（仅用核心列）。
- `evaluate` / `report` 路由的会话查询删除 `session_mode`，改查 `agent_role` 并分流。

### 2. 内容版本（`src/lib/services/content.ts` + content 路由）
- `GET/PUT /api/teacher/content`：读写 `content_versions` 草稿（admin 客户端），`PUT` 新版本号 = 该 experiment 最大 version + 1，`source_hash` = manifest 哈希。
- `POST /api/teacher/content/publish`：校验草稿 → 只更新 `published_at`（不新建行）。
- 学生会话启动后确保存在 `content_snapshot` 消息（取最新发布版；已存在则不重复写）；`GET /api/student/content` 读快照指向的 `content_versions.manifest` 并做 `validateCourseContent` 运行时校验。
- `manifest` JSONB 结构：`{ experiment, steps, rubrics, source_refs, editor_metadata, created_by, updated_by, status }`。

### 3. 分步评价（`src/domain/evaluation.ts` + `coze-workflows.ts` + evaluate 路由）
- `evaluations.result` 正式字段：`step_no, score, decision, strengths, missing_points, reasoning_review, standard_answer, improved_answer, knowledge_explanation, next_action, rubric_breakdown, evidence, prompt_version`（与既有 coveredPoints/scores/detailedIssues 等并存扩展，`assertEvaluation` 同步增补校验）。
- 学生提交：`agent_role='student'` → 既有 `record_text_evaluation` RPC + 超星 taskflow payload；`agent_role='teacher'` → 服务端直写 step_attempts/evaluations/step_states/agent_messages（request_id 幂等，不写 outbox、不推进统计）。
- 步骤通过或进入 `teacher_review` 时，由评价结果生成分步学习报告结构。

### 4. 统一成绩与学习报告（`src/lib/services/grading.ts` + grade/report 路由）
- `computeSessionGrade(facts)` 唯一入口：五维（知识理解/操作描述/科学决策/问题解决/结果分析与判断）、八步得分、总分、完成度、待复核步骤、`status`（`provisional | review_required | appealed | final`，JSON 字符串）。
- `GET /api/student/grade` 重写：删除 `refresh_grade_component`，改为实时计算（事实源 `evaluations`）。
- 总报告：`learning_reports.content` = `{ 总报告 sections, step_reports, grading:{ total_score, process_score, contribution_points, status, dimensions, step_reports, calculated_at, finalized_at, finalized_by } }`，`rendered_markdown` 可展示，`version` 递增；教师体验会话直写不进 outbox。

### 5. 申诉与复核（`src/lib/services/reviews.ts` + grade-reviews/reviews 路由 + `grade-review-panel.tsx`）
- 学生提交申诉：`agent_messages` 写 `grade_review_request`（metadata: request_id/report_id/reason/status/created_at）+ `event_logs.grade_review_requested`。
- 教师处理：`teacher_reviews`（report_id，decision=confirm/adjust/comment_only，comment）；adjust → 新 `learning_reports` 版本（新 grading、旧版保留）；写 `grade_review_resolution` 消息 + `event_logs.grade_review_resolved`；同一 request_id 串联。
- 时间线接口返回：原始成绩、申诉理由、教师处理、调整后成绩、各时间点。
- 既有 `record_teacher_review`（按 evaluation 的复核）保留。

### 6. 超星同步（`src/lib/chaoxing-sync.ts`）
- worker 成功分支：读取/回写 `payload.external_record_id` + `submitted_at` / `readback_verified` / `readback_at`；删除对独立列的 update。

### 7. 教师身份（`src/lib/supabase-chaoxing-user.ts`）
- 删除 `teacher_role_grants` 查询及 `console.warn` 静默降级路径；教师判定 = 稳定 roleId 白名单 → 写 `profiles.role` + `external_identities.raw_roles`；`content_admin` 同等教师能力；班级范围权限走 `enrollments` + `is_authorized_teacher`。

### 8. AI 助教（messages 路由 + `ai-tutor`/`step-workstation`）
- 服务端硬拒绝答题锁定（`learningStage='quiz'|'simulation'` → 409，保留并加固：缺失 learningStage 按答题态拒绝）；前端在知识检验/八步推演作答期间隐藏禁用（现状保持并核对实验地图、报告页、点评页可用）。
- 助教回答不落当前题目答案；每条响应在 `agent_messages.metadata` 记录 `promptVersion` / `workflowRunId` / `citations`（引用依据）。

### 9. 错误处理（`src/lib/api-result.ts`）
- `classifyApiError`：Supabase/PostgREST 错误 → `DB_ERROR`（透出 code/message，不输出密钥）；鉴权 → `AUTH_REQUIRED/FORBIDDEN`；`AiValidationError`（extractJson/assertEvaluation/normalizeStudyReport 抛出）→ `AI_OUTPUT_INVALID`；超时/网络 → `AI_TIMEOUT/NETWORK_ERROR`。禁止兜底成 AI 错误。

### 10. 迁移与文档
- 删除 `202608230001_unified_agent_v2.sql`、`202608240001_chaoxing_sync_contract.sql`（已核实两库均未执行）。
- 新增/更新：README、`docs/` 数据库映射说明（Coze 原生映射 + 两份迁移作废结论）、接口说明、部署文档、`AGENTS.md`。

### UI 适配点（无新页面、无导航变化）
- `step-review-report`：展示标准回答、推荐改写、知识点讲解、本步得分与依据（复用现有卡片样式）。
- `grade-review-panel.tsx`：删除 `source.grade_components` 读取，适配统一成绩结构与新申诉时间线。
- 移动端/PC 端无横向溢出回归检查。

## 实施步骤

1. **清理失效迁移与错误处理基础**：删除两份从未执行的迁移文件并更新 README/部署文档；重写 `api-result.ts` 错误分类（DB/鉴权/AI 校验/网络四类分离），新增 `AiValidationError`，杜绝数据库异常伪装成 AI 校验错误。关键文件：`src/lib/api-result.ts`、`supabase/migrations/`、`README.md`。
2. **会话层重构（修复 /student/map）**：新建 `services/sessions.ts`，学生会话只查 `agent_role='student'` 且 `current_step` null 归一 1；教师体验会话服务端原子创建/恢复（8 条 step_states + system 消息）；改写学生与教师体验 session 路由，删除全部 `session_mode` 查询。关键文件：`src/lib/services/sessions.ts`、`src/app/api/student/session/route.ts`、`src/app/api/teacher/practice-session/route.ts`。
3. **内容版本与会话快照**：新建 `services/content.ts`，`content_versions` 单表承载草稿/发布（发布只更新 `published_at`），学生开会话写 `content_snapshot` 消息并恒读快照版本；重写教师内容读写与发布路由、学生内容读取路由。关键文件：`src/lib/services/content.ts`、`src/app/api/teacher/content/route.ts`、`src/app/api/student/content/route.ts`。
4. **分步评价契约扩展**：扩展 `TextEvaluation` 与 prompt schema（step_no/score/strengths/missing_points/reasoning_review/standard_answer/improved_answer/knowledge_explanation/next_action/rubric_breakdown/evidence/prompt_version），`assertEvaluation` 运行时校验同步；evaluate 路由按 `agent_role` 分流（学生走既有 RPC，教师体验服务端直写且不进 outbox/成绩/同步）。关键文件：`src/domain/evaluation.ts`、`src/lib/coze-workflows.ts`、`src/app/api/student/evaluate/route.ts`。
5. **统一成绩、学习报告与申诉复核**：新建唯一成绩入口 `services/grading.ts` 与 `services/reviews.ts`；重写 grade/report 路由（`learning_reports.content` 含 grading+step_reports、版本递增）；申诉用 `agent_messages`+`teacher_reviews`+`event_logs` 全链路，调分生成新报告版本；适配 `grade-review-panel` 前端。关键文件：`src/lib/services/grading.ts`、`src/app/api/student/grade/route.ts`、`src/app/api/teacher/grade-reviews/route.ts`。
6. **同步 worker、教师身份与助教边界**：`chaoxing-sync.ts` 改读写 `payload.external_record_id`；`supabase-chaoxing-user.ts` 删除 `teacher_role_grants` 与降级路径；助教接口服务端硬拒绝答题锁定并记录 prompt_version/workflow_run_id/引用。关键文件：`src/lib/chaoxing-sync.ts`、`src/lib/supabase-chaoxing-user.ts`、`src/app/api/student/messages/route.ts`。
7. **测试、构建、文档与交付**：补齐 14 项测试（含 fake Supabase 客户端断言 agent_role 过滤、null 归一、教师体验隔离、快照、result 校验、成绩单入口、申诉时间线、outbox payload、助教禁用、错误分类），`pnpm test` + `pnpm build` 全绿；更新数据库映射说明/接口说明/`AGENTS.md`；提交推送 GitHub main、部署，用生产登录态链路验证 `/student/map`、提交、点评、报告、同步与日志，报告提交哈希与部署版本。关键文件：`tests/`、`README.md`、`AGENTS.md`。

## 验收口径

- 生产真实链路：登录 → `/student/map` 正常 → 进入当前步骤 → 提交文字推演 → 看到分步 AI 点评与标准答案 → 分步/总学习报告可查看；教师体验不污染学生数据；助教按页面/答题态显隐；学习通同步继续写 `sync_outbox`；两端无横向溢出；生产日志无不存在表/列错误。
- 全仓搜索 `session_mode`、`content_version_id`、`teacher_role_grants`、`content_drafts`、`grade_components`、`grade_review_requests`、`refresh_grade_component`、`start_or_resume_teacher_practice_session` 及 `sync_outbox.external_record_id` 列引用 = 0；无任何 42703/PGRST205 捕获降级路径。
- 明确确认：项目不再依赖两份无法在 Coze 生产库执行的迁移（文件已删除、文档已更新）。

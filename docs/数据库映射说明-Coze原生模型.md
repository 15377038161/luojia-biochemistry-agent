# 数据库映射说明（Coze 原生模型）

本文档是项目与 Coze 生产 Supabase 之间**唯一权威**的数据映射说明。

## 1. 背景与约束

- 专用 Supabase 项目 `luojia-biochemistry-agent`（ref：`kyovwpgraymkeytohnwc`）已于 2026-09-03 初始化。初始化完成后，生产应用运行时不执行 DDL。
- 正式数据模型按文件名顺序由以下迁移构成：
  - `supabase/migrations/202608140001_agent_core.sql`（核心表、RLS、四个业务 RPC）
  - `supabase/migrations/202608190001_profiles_role_lockdown.sql`（收回 profiles 自助更新策略）
  - `supabase/migrations/202609020002_teacher_student_dimensions.sql`（学生专业、年级、班级维度）
  - `supabase/migrations/202609030001_data_api_grants.sql`（新项目 Data API 最小表权限）
  - `supabase/migrations/202609030002_function_execute_lockdown.sql`（收回匿名 RPC 执行权限）
  - `supabase/migrations/202609031411_quiz_sessions.sql`（知识检验会话与状态）
  - `supabase/migrations/202609031500_quiz_questions.sql`（服务端题目池）
  - `supabase/migrations/202609031501_quiz_seed.sql`（首批题库数据）
  - `supabase/migrations/202609031502_quiz_access_lockdown.sql`（题库仅允许完成身份校验的服务端访问）
  - `supabase/migrations/202609031503_quiz_service_only_policies.sql`（删除已废弃的题库浏览器直连策略）
- 以下两份迁移**从未在任何共享数据库（开发/生产）执行**（已用 `to_regclass`/`information_schema` 双库只读核实），已从仓库删除，代码不再依赖其中任何对象：
  - `202608230001_unified_agent_v2.sql`（session_mode、content_version_id、teacher_role_grants、content_drafts、grade_components、grade_review_requests、v2 系列函数）
  - `202608240001_chaoxing_sync_contract.sql`（sync_outbox.external_record_id 列）
- 代码中禁止出现对上述已删除对象的 select/insert/update/rpc 调用，也禁止"查不到就降级"的双实现。

## 2. 会话类型映射

| 概念 | 正式实现 |
|---|---|
| 学生正式实验会话 | `agent_sessions.agent_role='student'`，经 `start_or_resume_student_session()` RPC 创建/恢复 |
| 教师体验实验会话 | `agent_sessions.agent_role='teacher'` 且 `current_step IS NOT NULL`，服务端 service-role 原子创建（会话 + 8 条 `step_states`（第 1 步 active）+ system 初始化消息）；已有未完成会话直接恢复 |
| 教师分析智能体会话 | `agent_sessions.agent_role='teacher'` 且 `current_step IS NULL`（无步骤状态） |
| 会话进度 | `current_step` 可能为 null，所有读取处一律 `Number(current_step) \|\| 1`，禁止默认第 8 步 |

隔离规则：

- 所有学生统计/成绩/同步查询必须显式 `agent_role='student'`。
- 教师体验数据不写 `sync_outbox`、不进入统一成绩、不进入班级统计与学习通同步（评价/报告走服务端直写分支）。

## 3. 内容版本映射

| 概念 | 正式实现 |
|---|---|
| 草稿 | `content_versions` 中 `published_at IS NULL` 的行 |
| 已发布版本 | `content_versions` 中 `published_at IS NOT NULL` 的行 |
| 内容载体 | `manifest` JSONB：`{ experiment, steps, rubrics, source_refs, editor_metadata, created_by, updated_by, status }` |
| 内容指纹 | `source_hash`（manifest 的 sha256） |
| 版本号 | `version`，同一 `experiment_id` 范围内递增（`unique(experiment_id, version)`） |
| 发布 | 只更新草稿行的 `published_at`，不新建行 |
| 会话内容快照 | 学生开始实验时写 `agent_messages`：`kind='content_snapshot'`，`metadata.content_version_id` / `metadata.content_version` / `metadata.source_hash`；此后该会话恒读快照对应版本，教师发布新版不改变历史实验 |

写入路径：`content_versions` 对用户客户端只有教师只读策略，草稿写入、发布与学生侧读取一律走服务端 service-role 客户端（先在路由层完成身份与会话归属校验）。

## 4. 教师身份映射

| 概念 | 正式实现 |
|---|---|
| 应用角色 | `profiles.role` ∈ {student, teacher, content_admin}；teacher/content_admin 具备教师能力 |
| 学习通原始角色 | `external_identities.raw_roles`（OAuth 入库时保存） |
| 课程/班级授权 | `enrollments` |
| 班级范围权限 | `is_authorized_teacher(class_id)` |

禁止只根据前端参数、URL 或客户端 role 判断教师身份；不得把所有相同 `external_role_id` 的用户自动授予教师权限（学习通入库时只按稳定 roleId 白名单写入 `profiles.role`）。

## 5. 分步点评映射

| 概念 | 正式实现 |
|---|---|
| 学生作答 | `step_attempts`（`request_id` 幂等） |
| AI 结构化评价 | `evaluations`，`result` JSONB 正式字段：`step_no, score, decision, strengths, missing_points, reasoning_review, standard_answer, improved_answer, knowledge_explanation, next_action, rubric_breakdown, evidence, prompt_version`（兼容既有 v2 字段） |
| 步骤最终总结 | `step_states.final_summary` |
| 可见对话 | `agent_messages`（step_answer / feedback 等） |
| 分步学习报告 | 步骤通过或进入教师复核时生成，纳入 `learning_reports.content.step_reports` |

## 6. 成绩与学习报告映射

| 概念 | 正式实现 |
|---|---|
| 分步成绩事实来源 | `evaluations`（每步最后一次有效评价） |
| 成绩计算 | 唯一入口 `src/lib/services/grading.ts`：五维（知识理解/操作描述/科学决策/问题解决/结果分析与判断）、八步得分、总分、完成度、需教师复核步骤 |
| 总报告 | `learning_reports`：`content` JSONB（总报告 + 分步报告 + `grading`），`rendered_markdown` 可展示文本，`version` 递增，`workflow_run_id` 记录 AI 任务 |
| `grading` 结构 | `total_score, process_score, contribution_points, status, dimensions, step_reports, calculated_at, finalized_at, finalized_by` |
| 成绩状态 | JSON 字符串：`provisional` / `review_required` / `appealed` / `final` |

学生成绩、教师看板、雷达图和学习通同步一律调用统一成绩模块，禁止页面各算一套。

## 7. 复核与申诉映射

| 环节 | 正式实现 |
|---|---|
| 学生申诉 | `agent_messages` `kind='grade_review_request'`，`metadata`：`request_id, report_id, reason, status, created_at`；`event_logs` 写 `grade_review_requested` |
| 教师处理 | `teacher_reviews`（`report_id`，`decision` ∈ confirm/adjust/comment_only，`comment`） |
| 调整成绩 | 更新 `learning_reports` 生成**新 version**（禁止覆盖旧版本） |
| 处理回执 | `agent_messages` `kind='grade_review_resolution'`；`event_logs` 写 `grade_review_resolved` |
| 关联 | 同一 `request_id` 串联完整时间线；保留原始成绩、申诉理由、教师处理、调整后成绩和时间点 |
| 单条评价复核 | 既有 `record_teacher_review()` RPC（`evaluation_id` 维度）保留 |

## 8. 学习通同步映射

| 概念 | 正式实现 |
|---|---|
| 外部记录编号 | `sync_outbox.payload.external_record_id`（JSONB 内字段，不是独立列） |
| 成功回写 | worker 更新 `payload`：`{ external_record_id, submitted_at, readback_verified, readback_at }` |
| 禁止 | select/insert/update 独立的 `external_record_id` 列 |

## 9. AI 助教边界

- 允许场景：实验地图、报告页、步骤完成后的点评页。
- 禁用场景：知识检验或八步文字推演作答进行中——前端隐藏并禁用，服务端同时硬拒绝（缺失或为 `quiz`/`simulation` 的学习阶段一律拒绝）。
- 助教不得直接提供当前题目的答案；每条响应在 `agent_messages.metadata` 记录 `promptVersion`、`workflowRunId`、`citations`。

## 10. 错误分类约定

| 类别 | 错误码 | 说明 |
|---|---|---|
| 数据库异常 | `DB_ERROR` | 透出 Supabase `code` 与 `message`，不输出密钥，绝不伪装成 AI 异常 |
| 鉴权 | `AUTH_REQUIRED` / `FORBIDDEN` | 登录态与权限 |
| AI 输出校验 | `AI_OUTPUT_INVALID` | 仅当 AI 输出结构校验失败（`AiValidationError`） |
| 网络/超时 | `AI_TIMEOUT` / `NETWORK_ERROR` | 外部调用异常 |

## 11. RLS 写入路径速查

用户客户端（cookie 会话）可写：`agent_sessions`（本人）、`agent_messages`（本人会话）、`learning_reports`（本人会话）、`teacher_reviews`（授权教师）。
必须走服务端 service-role 客户端：`step_states`、`content_versions`、`event_logs`、`sync_outbox`（服务端先完成归属与权限校验）。

知识检验的 `quiz_questions` 与 `quiz_sessions` 同样只走服务端：路由先从 Cookie 校验当前用户，再用 service-role 读取题目或更新且强制匹配 `user_id`。会话字段以 `status`（`in_progress` / `submitted` / `graded`）、`submitted_at`、`graded_at` 为准，不存在 `completed_at`。

Supabase Security Advisor 对 `ai_jobs`、`event_logs`、`audit_logs`、`sync_outbox`、`external_identities` 的“RLS 已开启但无策略”提示属于预期：这些表已对 `anon` / `authenticated` 收回表权限，只允许 service-role。业务 RPC 为保证多表原子写入保留 `SECURITY DEFINER`，函数体逐一校验 `auth.uid()`、会话归属或教师授权；`202609030002_function_execute_lockdown.sql` 已收回 `PUBLIC` / `anon` 的执行权，仅允许 `authenticated` 调用。

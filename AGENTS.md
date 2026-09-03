# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## 数据模型：Coze 原生生产 Schema（唯一正式模型）

生产库以 `supabase/migrations/202608140001_agent_core.sql` 为唯一数据模型，**生产环境禁止执行任何 DDL**。以下对象在两个库中均不存在，代码中不得出现任何运行时引用（select/insert/update/RPC 调用、或捕获 42703/PGRST205 后静默降级）：

- `agent_sessions.session_mode`、`agent_sessions.content_version_id`
- `teacher_role_grants`、`content_drafts`、`grade_components`、`grade_review_requests`
- `sync_outbox.external_record_id` 独立列（外部编号存 `sync_outbox.payload.external_record_id`）
- `start_or_resume_teacher_practice_session`、`refresh_grade_component` RPC
- 已删除的失效迁移 `202608230001_unified_agent_v2.sql` / `202608240001_chaoxing_sync_contract.sql` 不得重新引入

### 正式映射约定

| 能力 | 承载对象 |
|------|----------|
| 会话类型 | `agent_sessions.agent_role`（`student`=正式实验 / `teacher`=教师体验）；学生查询必须显式 `agent_role='student'`，教师体验必须显式 `'teacher'` |
| 学生会话创建 | 现有 `start_or_resume_student_session` RPC |
| 教师体验会话 | 服务端原子创建（`agent_sessions` + 8 条 `step_states` + system 消息），**不得进入成绩、班级统计、学习通同步** |
| 内容草稿/发布 | `content_versions` 单表：`published_at IS NULL`=草稿；发布只更新 `published_at`；manifest JSONB 存 experiment/steps/rubrics/source_refs/editor_metadata/created_by/updated_by/status |
| 会话内容锁定 | 学生开会话时写 `agent_messages.kind='content_snapshot'`（metadata 存 content_version_id/source_hash），该会话终身读快照版本 |
| 教师身份 | `profiles.role` + `external_identities.raw_roles` + `enrollments` + `is_authorized_teacher(class_id)` RPC；禁止仅凭前端参数判断 |
| 分步点评 | `evaluations.result` JSONB 正式保存 step_no/score/decision/strengths/missing_points/reasoning_review/standard_answer/improved_answer/knowledge_explanation/next_action/rubric_breakdown/evidence/prompt_version |
| 成绩计算 | **唯一入口** `src/lib/services/grading.ts` 的 `computeGradeSummary`；八步等权、贡献度=过程成绩×0.1、五维雷达同模块输出；禁止页面/路由各算一套 |
| 报告 | `learning_reports`：content JSONB（含 grading）+ rendered_markdown，version 递增；状态 provisional/review_required/appealed/final |
| 申诉复核 | `agent_messages`（grade_review_request/grade_review_resolution，metadata.request_id 关联）+ `teacher_reviews` + `event_logs`；调分生成新 learning_reports 版本，**禁止覆盖旧版本** |
| 学习通同步 | 外部编号写入 `sync_outbox.payload`（`{external_record_id, submitted_at, readback_verified, readback_at}`），同步成功后回写 payload |

### 服务层（`src/lib/services/`）

- `sessions.ts`：学生/教师体验会话查找与创建、`normalizeCurrentStep`、会话视图加载
- `content.ts`：content_versions 草稿/发布/快照、manifest 编解码与哈希
- `grading.ts`：成绩事实加载与唯一计算入口、报告 content 构建（含 lossAnalysis/knowledgeGaps/improvementSuggestions 三维度分析聚合）
- `appeals.ts`：申诉提交/列表/处理完整时间线
- `evaluation-record.ts`：分步评价信封构建（`buildEvaluationResultEnvelope`）与教师体验评价直写（不经 RPC、不入 outbox）

### 错误分类（`src/lib/api-result.ts` + `src/lib/errors.ts`）

数据库/鉴权/AI 校验/网络四类分离：`"智能体返回内容未通过校验"`（AI_OUTPUT_INVALID）只能来自 `AiValidationError`（真实 AI 输出结构错误）；Supabase/PostgREST 错误按 DB_ERROR 返回 code+message（不输出密钥）；网络类错误走 NETWORK_ERROR。禁止把数据库异常伪装成 AI 异常，禁止"字段不存在就临时 fallback"。

### RLS 现实

`content_versions` 仅教师可读、`step_states` 仅 SELECT、`event_logs` 对 authenticated 全部 revoke——这些表的读写必须走 `getSupabaseAdminClient()`（`@/lib/supabase-client`，service-role）。

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**

## 常见问题和预防

- 学生会话 `agent_sessions.current_step` 可能为 null（历史数据/旧创建路径）。所有读取处必须用 `|| 1` 归一到第 1 步，**严禁**用 `|| 8`：后者会把"当前步骤"误判为第 8 步，使学生端 `isCurrent=false`、提交按钮被锁成"仅当前步骤可提交"。评估接口 `src/app/api/student/evaluate/route.ts` 同样要对 null 归一（`Number(...) || 1`），并对可能缺失的 `step_states` 行用 `maybeSingle` + 默认 0 容错：该文件内**每一处** `state.attempt_count` 读取（含传给 `buildChaoxingTaskflowPayload` 的 `versionNo`）都必须写成 `(state?.attempt_count ?? 0) + 1`，漏掉任何一处都会导致 `next build` 类型检查失败、部署中断。

## AI 点评与知识点检验系统（2026-09 重构）

### 评测逻辑（`src/lib/coze-workflows.ts` - `evaluateText`）

**核心评测维度（三维对标，必须充分验证）**：
1. **知识点掌握程度**：学生是否准确理解并运用本步所需的生化原理、术语、条件关系与参数范围
2. **实验步骤细节理解度**：学生是否清楚各步骤的设计目的、操作顺序、关键条件、注意事项与误差来源
3. **实验数据解读清晰度**：学生能否从案例数据推导出正确结论、识别异常、建立因果关系并推测后续影响

**三必查清单（任一项未通过则必须归为 missing/incorrect/ambiguous，不得虚判为 covered）**：
- **知识点必查**：是否写出核心原理的关键术语与因果关系，还是只写了操作流程
- **实验细节必查**：是否交代关键参数（温度、浓度、时间）、操作顺序与注意事项，还是仅列出大致步骤
- **数据解读必查**：能否从给定数据推导正确结论、识别异常并推测后续影响，还是只重复描述数据本身

**反例参照（判定 incorrect/ambiguous 的典型信号）**：
- 学生写"加入试剂A"但未说明浓度、加入顺序、等待时长 → 实验细节缺失
- 学生写"通过电泳分离蛋白"但未提及SDS作用、凝胶浓度或分子筛原理 → 知识点浮于表面
- 学生看到"泳道2比泳道1条带更亮"就结论"表达量高"但未解释亮度与蛋白量关系、未考虑上样量差异 → 数据解读跳步
- 学生写"小心操作"但未说明具体风险点或防范措施 → 空泛表述

**答案解析升级要求**：
- `standardAnswer`：完整参考答案，必须包含 ① 底层原理（如SDS作用机制、分子筛原理、pH影响蛋白稳定性的化学键基础）；② 实验步骤的设计目的、操作顺序、关键参数及注意事项；③ 实验数据的推导过程（从观察到结论的逻辑链、异常识别与误差分析）；④ 关联前置与后续知识点；⑤ 常见误区与纠正方法。答案详尽到可作教材。
- `improvedAnswer`：在学生原作答基础上的改写推荐答案。保留学生表达风格与已写对的部分，对 missing/incorrect/ambiguous 项逐一补齐或纠正，每处补齐必须注明"（补充：原理是……）"或"（纠正：应为……，因为……）"。
- `knowledgeExplanation`：本步涉及核心知识点的详细讲解。必须包含核心概念的底层原理拆解、关键参数的取值依据与影响、关联前置知识与后续影响、常见误区。讲解详尽到学生可直接用于复习备考。

### 学习报告改版（`src/lib/services/grading.ts` + `src/components/student/study-report.tsx`）

**新增三维度分析聚合（`computeGradeSummary`）**：
- `lossAnalysis`：失分点解析（从各步 detailedIssues 聚合 incorrect/ambiguous/missing 项，标注维度、引证学生原文或"未交代"、说明影响）
- `knowledgeGaps`：知识点掌握短板（从各步 reasoning_review + missing_points 归纳薄弱概念与具体短板）
- `improvementSuggestions`：针对性提升建议（按知识点掌握、实验操作理解、数据解读能力、细节把控能力、知识迁移应用五个维度给出可执行动作）

**报告展示（`study-report.tsx`）**：
- 已在五维雷达图下方补充三个独立卡片展示 lossAnalysis/knowledgeGaps/improvementSuggestions
- 五维雷达图沿用既有计算（从 radarPoints 读取）
- 报告页面已是独立路由 `/student/report`，无需再改

### 知识点检验系统（全新建立）

**数据模型（`supabase/migrations/202609031411_quiz_sessions.sql`）**：
- `quiz_sessions` 表：session_id（主键）、user_id、step_no、questions（JSONB 数组）、answers（JSONB）、results（JSONB）、status（'in_progress'/'completed'）、created_at/completed_at
- 题目池随机化：AI 每次调用生成不同题目，避免重复

**AI 出题（`src/lib/coze-workflows.ts` - `generateQuizQuestions`）**：
- 入参：stepNo（步骤编号）、count（题目数量，默认5）
- 出题维度：知识点、实验细节、数据解读三个维度各至少1题
- 题干清晰具体，干扰项基于常见误区设计，explanation 详尽（正确答案原理、错误选项误区、关联知识点）
- 高温度（0.8）确保题目随机性

**API 路由**：
- `POST /api/student/quiz/start`：创建新会话，AI 出题，返回 session_id + questions（不含 correct_option_id 和 explanation）
- `GET /api/student/quiz/session?session_id=xxx`：查询会话状态（已完成的会话返回 results）
- `POST /api/student/quiz/submit`：提交答案，AI 批改（对比 correct_option_id），返回 results（每题的 is_correct + explanation + correct_option_id）

**答题页面（`src/app/student/quiz/[session_id]/page.tsx`）**：
- 单页单题：当前题提交后才显示下一题按钮
- 所有题目提交后统一展示批改结果（每题的正确答案、用户选项、是否正确、详细解析）
- 流程：加载会话 → 逐题作答（提交一题显示下一题）→ 最后一题提交后跳转结果页 → 展示所有题的批改与解析

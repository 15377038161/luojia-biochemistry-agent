# 数据库权限与 AI 数据隔离矩阵

## 强制边界

| 数据/能力 | 学生本人 | 其他学生 | 授权教师 | 非授权教师/匿名 | 实现入口 |
|---|---|---|---|---|---|
| 会话、步骤、本人回答 | 可读写本人 | 拒绝 | 可读授权班级 | 拒绝 | RLS + 会话归属校验 |
| 成绩、评测证据、报告 | 仅本人 | 拒绝 | 可读授权班级 | 拒绝 | RLS + `teacher-scope.ts` |
| 自选基因档案 | 本人会话可用，步骤1后锁定 | 拒绝 | 可读授权班级 | 拒绝 | 服务端 API + RLS |
| 题库答案与测验会话 | 仅服务端按本人身份处理 | 拒绝 | 不直接开放 | 拒绝 | 客户端零授权，Service Role 服务端使用 |
| 教师 AI 查询 | 无工具权限 | 无工具权限 | 仅接收服务端筛选后的授权班级证据 | 拒绝 | `teacher-agent.ts` + 班级范围校验 |
| 学生 AI 助教 | 本人当前会话与公共课程资料 | 无法查询 | 不适用 | 拒绝 | 同伴数据意图过滤 + 无班级查询工具 |
| 审计、事件、同步 outbox | 无直接权限 | 无直接权限 | 无直接权限 | 无直接权限 | 仅服务端 |

## 正式迁移

- `202609040001_student_experiment_profiles_and_privacy.sql`：新增会话级基因档案、RLS、题库唯一索引，并撤销敏感表宽授权。
- `202609040002_quiz_seed_steps_3_8.sql` 与 `202609040003_remove_placeholder_quiz_options.sql`：保留迁移审计并清除不符合教学质量的占位题；步骤3–8由服务端 AI 在未做题不足时生成、校验并入池。
- 生产运行时不得执行 DDL；只允许通过版本化 migration 发布。

## API 授权规则

1. 学生 API 先从 Cookie 解析真实用户，再校验 `agent_sessions.user_id`；请求体中的用户编号不参与授权。
2. 教师 API 同时校验教师能力、`enrollments` 授权班级与目标学生会话归属；仅有 `sessionId` 不构成权限。
3. Service Role 只存在于服务端环境变量；浏览器不接触题库答案、报告写入能力和全库查询能力。
4. 教师复核新增报告版本并保留旧版，禁止覆盖历史报告。

## Advisor 结果（2026-09-04）

- 新增 `student_experiment_profiles` 已启用 RLS，包含本人读取和授权教师读取策略。
- `quiz_sessions`、`quiz_questions`、`event_logs`、`audit_logs`、`sync_outbox` 对 `anon/authenticated` 无表级授权。
- Advisor 的 `RLS enabled no policy` 对上述服务端专用表属于预期的默认拒绝状态。
- 既有 `SECURITY DEFINER` RPC 被标记为可执行提示；当前四个业务 RPC 均由已登录用户调用且在函数内绑定 `auth.uid()`/教师授权，是有意暴露面，后续修改必须继续做越权回归。
- 既有外键索引与部分 RLS init-plan 性能提示不影响本轮正确性，作为后续性能整理项保留，不在本轮扩大数据库重构范围。

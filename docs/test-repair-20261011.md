# 测试修复记录（2026-10-11）

## 修复范围

本次仅修复 `tests/supabase-config.test.ts` 一个文件，不涉及业务实现、不访问生产库、不动密钥文件。

## 修复前快照

- backup 分支：`backup/before-test-repair-20261011` → `ab7bfdd3f6d6af7830093be583f5ff0dcb0bb04a`

## 修复原因

`src/lib/supabase-client.ts` 的 Supabase 凭据读取已从 `SUPABASE_*`/`COZE_SUPABASE_*` 迁移到 `CODER_SUPABASE_*`（含 `CODER_SUPABASE_TENANT_ID`，返回结构新增 `tenantId`）。原测试仍用旧键名且缺 `tenantId`，导致 4 项断言失败；同时 `withCleanSupabaseEnv` 清理清单遗漏 `CODER_SUPABASE_*`，沙箱真实注入变量污染测试（测试隔离缺陷）。

## 修复内容

1. `ENV_NAMES` 新增 `CODER_SUPABASE_URL`、`CODER_SUPABASE_ANON_KEY`、`CODER_SUPABASE_TENANT_ID`、`NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID`，修复测试隔离。
2. 「直接 Supabase 环境变量」→ 改用 `CODER_SUPABASE_*` 键名，断言三元组 `{url, anonKey, tenantId}`。
3. 「显式配置优先」→ 改为「`CODER_SUPABASE_*` 优先于旧 `SUPABASE_*` 键名」，保留优先级测试意图。
4. 「缺 service role 不误报接通」→ 改为「缺 `tenantId` 不误报接通」。依据：`src/lib/supabase-client.ts` 注释明确「平台只提供 anon key，本项目禁止持有 SERVICE_ROLE_KEY」，`getSupabaseCredentials()` 返回结构 `{url, anonKey, tenantId}` 不含 service role，后台授权已由运行时 JWT（`Authorization: Bearer <token>`）+ RLS 替代。故「缺 service role」在新架构下无对应配置维度，负向断言意图迁移到「缺 `tenantId`」（当前真实的必要配置）。
5. 「非本地 HTTP 被拒绝」→ 改用 `CODER_SUPABASE_URL=http`，保留 HTTPS 安全负向断言，错误文案断言同步。
6. 新增独立负向测试「后台访问禁止依赖 service role，凭据结构不含 service role」：设置假 `SUPABASE_SERVICE_ROLE_KEY`，断言凭据结构不暴露任何 service role 字段（`serviceRoleKey` 不在返回结构中），保留后台授权保障、不凭猜测要求 SDK 不存在的 service-role 字段、不调用生产。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/supabase-config.test.ts` | 0 | 5/5 通过 |
| `pnpm test`（全量） | 1 | 78 pass / 5 fail（共 83） |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 0 error / 20 warning |
| `pnpm build` | 0 | 通过 |

## 剩余未修复失败（如实保留，不在本次范围）

- `tests/ai-gateway.test.ts`（3 项）：AI 网关已迁移到平台内置 LLM SDK，测试仍断言旧模型名/重试语义。密钥不泄漏契约仍有效，本轮不改。
- `tests/teacher-workspace.test.ts`（1 项）：引用已删除的 `supabase-chaoxing-user.ts`，职责已并入 `supabase-auth.ts`。

---

# 第二轮：quiz-database-contract 修复（2026-10-11）

## 修复前快照

- backup 分支：`backup/before-quiz-contract-repair-20261011` → `0050f47cabaa26e8d585f0d2902531fd24a15c37`

## 修复原因

`tests/quiz-database-contract.test.ts` 的鉴权入口断言仍引用旧签名 `getSessionUser(req.cookies)` 与旧客户端 `getSupabaseAdminClient()`。实际实现已迁移为：`getSessionUser(req)`（从 `x-sandbox-authorization` 头读 JWT）→ 返回 `identity.supabase`（携带用户 JWT 的低权限客户端），并通过 `.eq('user_id', identity.user.id)` 限定用户归属。

## 修复内容

1. 鉴权入口断言：`getSessionUser(req.cookies)` → `getSessionUser(req)`。
2. 数据访问客户端断言：`getSupabaseAdminClient()` → `identity.supabase`（用户 JWT 客户端）。
3. 新增用户归属断言 `user_id`（`.eq('user_id', identity.user.id)`）。
4. 保留 `doesNotMatch supabase.auth.getUser()`（不直接调用 getUser）。
5. 新增「题目答案不泄漏」断言：start 的 `clientQuestions` 返回对象仅含 `{ question_id, question_text, options }`，不暴露 `correct_option_id`/`explanation`。
6. 新增「完成会话返回 results」断言：submit 返回 `{ results, score, total }`。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/quiz-database-contract.test.ts` | 0 | 3/3 通过 |
| `pnpm test`（全量） | 1 | 79 pass / 4 fail（共 83） |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 0 error / 20 warning |
| `pnpm build` | 0 | 通过 |

## 说明

- 本轮仅更新测试静态引用并保留/补充安全契约断言，未改业务实现、未动数据库 DDL、未写生产库、未动密钥文件。
- 「禁止 service-role 配置」的测试不构成真实 RLS 权限验收；无效/缺 JWT 被拒绝、受限表不可用等仍需真实集成验证。

---

# 第三轮：teacher-workspace 修复（2026-10-11）

## 修复前快照

- backup 分支：`backup/before-teacher-workspace-repair-20261011` → `0d9d94b492a72477a28ff75bd05e9bd8df4f6b94`

## 修复原因

`tests/teacher-workspace.test.ts` 的「学习通身份学籍字段有正式落库迁移且缺失时不伪造」断言引用已删除文件 `src/lib/supabase-chaoxing-user.ts`，且旧断言 `userInfo.majorName || null` 语义已过时。学籍字段归一化职责已并入 `src/lib/supabase-auth.ts`，缺失值语义为经 `getString` 归一化后返回空串 `''`（非 `null`）。

## 修复内容

1. 身份文件引用：`src/lib/supabase-chaoxing-user.ts` → `src/lib/supabase-auth.ts`。
2. 落库迁移断言：保留 4 个 snake_case 学籍字段（`major_name`、`grade_name`、`class_name`、`academic_source`）在迁移 SQL 中的断言。
3. 身份归一化层断言：改为暴露 3 个 camelCase 字段（`majorName`、`gradeName`、`className`），缺失经 `getString` 归一化返回空串 `''` 不伪造。
4. 保留「正式落库迁移」与「缺失不伪造」两个核心契约意图，未改业务实现。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/teacher-workspace.test.ts` | 0 | 3/3 通过 |
| `pnpm test`（全量） | 1 | 80 pass / 3 fail（共 83） |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 通过（eslint --quiet） |
| `pnpm build` | 0 | 通过 |

## 说明

- 本轮仅更新测试静态引用并适配当前身份实现，未改业务实现、未动数据库 DDL、未写生产库、未动密钥文件。
- 剩余 3 项失败为 `tests/ai-gateway.test.ts`（AI 网关已迁移到平台内置 LLM SDK，模型名/重试语义断言过期），密钥不泄漏契约仍有效，本轮明确保留不改。

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
- `tests/quiz-database-contract.test.ts`（1 项）：`getSessionUser(req.cookies)` 签名已改为 `getSessionUser(req)`。
- `tests/teacher-workspace.test.ts`（1 项）：引用已删除的 `supabase-chaoxing-user.ts`，职责已并入 `supabase-auth.ts`。

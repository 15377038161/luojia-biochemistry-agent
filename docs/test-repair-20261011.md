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
4. 「缺 service role 不误报接通」→ 改为「缺 `tenantId` 不误报接通」（保留负向断言意图：缺关键配置不得误报）。
5. 「非本地 HTTP 被拒绝」→ 改用 `CODER_SUPABASE_URL=http`，保留 HTTPS 安全负向断言，错误文案断言同步。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/supabase-config.test.ts` | 0 | 4/4 通过 |
| `pnpm test`（全量） | 1 | 77 pass / 5 fail |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 0 error / 20 warning |
| `pnpm build` | 0 | 通过 |

## 剩余未修复失败（如实保留，不在本次范围）

- `tests/ai-gateway.test.ts`（3 项）：AI 网关已迁移到平台内置 LLM SDK，测试仍断言旧模型名/重试语义。密钥不泄漏契约仍有效，本轮不改。
- `tests/quiz-database-contract.test.ts`（1 项）：`getSessionUser(req.cookies)` 签名已改为 `getSessionUser(req)`。
- `tests/teacher-workspace.test.ts`（1 项）：引用已删除的 `supabase-chaoxing-user.ts`，职责已并入 `supabase-auth.ts`。

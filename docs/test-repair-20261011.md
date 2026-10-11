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

---

# 第四轮：ai-gateway 重试预算修复（2026-10-11）

## 修复前快照

- backup 分支：`backup/before-ai-retry-budget-20261011` → `c9a3e34bda4c2216b6679c8ea54d4d4b1ef62639`

## 修复原因

`AI_GATEWAY_RETRY_COUNT` 环境变量控制随网关迁移到平台内置 LLM SDK 后失效：SDK 只读 `Config.retryTimes`（默认 3），不读 `AI_GATEWAY_RETRY_COUNT`；原 `getClient()` 用 `new Config()` 未暴露重试预算，且单例缓存导致运行时配置无法切换，导致「生产配置允许将网关重试次数设为 0」契约失效。

## 修复内容（仅 ai-gateway.ts 配置层 + 对应测试）

1. `getClient()` 移除单例缓存，改为每次按当前环境变量构造 `new Config({ retryTimes: resolveRetryTimes() })`，保证运行时配置即时生效。
2. 新增 `resolveRetryTimes()`：读取 `AI_GATEWAY_RETRY_COUNT`，缺省 3、允许 0；校验非负有限整数（`Number.isInteger`）及合理上界（`MAX_RETRY_TIMES = 5`）；非法/越界值明确 `throw Error`，不静默回退。
3. 重试仅由 SDK 内部完成（`Config.retryTimes`），业务层不叠加重试，避免乘法重试。
4. 保留原生模型映射（doubao-seed / deepseek），未改模型分工。

## 离线 mock 验证

- 定位 SDK 打包实际 axios 位置：`require.resolve('coder-coding-dev-sdk')` 入口 + `realpathSync` 得到 `.pnpm/coder-coding-dev-sdk@.../node_modules/coder-coding-dev-sdk/dist/cjs/index.js`，再 `createRequire(真实路径)('axios')` 解析到 `.pnpm/axios@1.20.0/node_modules/axios/dist/node/axios.cjs`。
- 确认 axios 1.x 自定义 adapter 需自行 reject 非 2xx（带 `response` 字段），而非返回 status（否则 503 被当成功）。
- 运行时验证：`retryTimes=0` → 1 次请求；`retryTimes=1` → 2 次请求（503 被识别为可重试错误）。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/ai-gateway.test.ts` | 1 | 4/5 通过（thinking 契约保留失败） |
| `pnpm test`（全量） | 1 | 84 pass / 1 fail（共 85） |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 0 error / 20 warning |
| `pnpm build` | 0 | 通过 |

## 剩余 1 项失败（如实保留）

- `tests/ai-gateway.test.ts` 第 2 项「深度思考扩展字段不兼容时自动移除后重试」：SDK 已不发送 `thinking` 字段（被 `buildRequestBody` 忽略），无「移除后重试」语义，深度思考能力已退化。按用户要求不改该契约测试、不猜字段、不改业务，保留失败。

## 密钥安全结论撤回

- 此前「密钥不进入错误/返回值」的结论**撤回**：上游响应的 `message`/`data` 可能回显密钥（请求头/鉴权信息），静态 `new Config()` 与 `APIError` 字段结构不足以证明不泄密。密钥安全验收待独立真实集成验证，本轮不以静态结构证明。

## 说明

- 本轮修改 `ai-gateway.ts`（配置层）+ 对应测试 + 修复记录；未动密钥文件、未写生产库、未改 DDL、未 push。

---

# 第五轮：AI 上游错误边界脱敏（2026-10-11）

## 修复前快照

- backup 分支：`backup/before-ai-error-boundary-20261011` → `c76d75affcc53f0639a8f9e3c3e85e3e36ff52c3`

## 修复原因

运行时哨兵回显探针证实：上游模型服务在 `message`/`data` 中回显密钥时，SDK 的 `APIError` 会原样透传（`error.message`/`error.data`/可枚举属性均含哨兵），而统一错误分类入口 `errorFromUnknown` 的 fallback 分支 `{ code: 'VALIDATION_ERROR', message }` 直接透传原始 `message`，导致密钥泄漏到客户端响应。日志同样需脱敏（禁止完整原始错误含 message/data 入日志）。

## 修复内容（最小统一服务端边界，仅错误边界文件）

1. `src/lib/errors.ts`：新增 SDK 上游异常识别（靠 `name` 识别 `APIError`/`NetworkError`/`CoderCodingError`/`ConfigurationError`/`ValidationError`，不 import SDK 避免耦合），及 `llmSdkErrorStatus` 提取有效 HTTP 状态数字。
2. `src/lib/api-result.ts` 的 `errorFromUnknown`：在 fallback 之前收敛 SDK 上游异常——
   - `NetworkError` → `NETWORK_ERROR`（通用消息，不透传原始 message）
   - `APIError` 无有效 status → `AI_OUTPUT_INVALID`（真实 AI 输出结构错误）
   - 其余（含 `APIError` 有 status）→ `AI_UPSTREAM_ERROR`（通用中文消息，保留有效 HTTP 状态数字）
3. `src/domain/agent.ts`：`ApiError` 新增 `AI_UPSTREAM_ERROR` code 与可选 `status?: number` 字段。
4. 未泛化重写数据库/认证错误（`DB_ERROR`/`AUTH_REQUIRED` 等透出逻辑保持不变）。

## 运行时离线 mock 负向测试（`tests/ai-error-boundary.test.ts`）

- 上游 message/data 回显哨兵 → 收敛为 `AI_UPSTREAM_ERROR`（status 保留，message/整对象不含哨兵）。
- 网络错误（name=NetworkError）含哨兵 → 收敛为 `NETWORK_ERROR`（不含哨兵）。
- SDK `APIError` 无有效状态 → 收敛为 `AI_OUTPUT_INVALID`（不透传原始结构错误 message）。
- 成功响应正常返回内容。
- 保留原深度思考失败契约（`ai-gateway.test.ts` 第 2 项）未改绿。

## 测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `tsx --test tests/ai-error-boundary.test.ts` | 0 | 4/4 通过 |
| `pnpm test`（全量） | 1 | 88 pass / 1 fail（共 89） |
| `pnpm ts-check` | 0 | 通过 |
| `pnpm lint` | 0 | 0 error / 20 warning |
| `pnpm build` | 0 | 通过 |

## 剩余 1 项失败（如实保留）

- `tests/ai-gateway.test.ts` 第 2 项「深度思考」：深度思考实现未接线（SDK 类型声明 `thinking?: 'enabled' | 'disabled'`，但 `buildRequestBody` 未读取），且 SDK 类型不能证明 doubao 上游接受该字段，本轮不改。

## 说明

- 本轮仅改错误边界（`errors.ts`/`api-result.ts`/`domain/agent.ts`）+ 新增错误边界测试 + 修复记录；未改业务实现、未改密钥文件、未写生产库、未改 DDL、未 push、未调用真实付费模型。

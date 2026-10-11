# 登录初始化竞态修复说明

> 日期：2026-10-12
> 基线提交：`118516318f3d226d5493a60c1b5d877a683335ee`（修复前 HEAD）
> 快照分支：`backup/before-login-init-fix-20261012`
> 范围：登录页/受保护页客户端初始化链路——消除 session 初始化失败导致的永久空白页。
> 不新增鉴权体系，不修改 DDL / RLS / 密钥 / 权限，不暴露 service-role。

## 背景

生产环境浏览器访问 `/login` 出现「DOM 仅 alert 空白」。定位到客户端 Supabase 客户端
初始化链路存在竞态与异常未兜底，导致 AuthGuard 在 session 初始化失败时永久返回 `null`（白屏）。

## 根因

1. `getSupabase()`（`src/lib/supabase.ts`）仅读构建期 `NEXT_PUBLIC_CODER_SUPABASE_*`，缺失即 `throw`。
   平台注入的是无前缀 `CODER_SUPABASE_*`（由 `/api/supabase-config` 运行时提供，
   `SupabaseConfigProvider` 注入 `window.__SUPABASE_CONFIG__`），客户端未复用该运行时配置源。
2. `AuthGuard.evaluate()` 无 try/catch，`getSession()` reject 时 unhandled rejection，`ready` 永不为 true → 白屏。
3. `resolveLoginDestination()` 的 `response.json()` 无兜底，网关返回非 JSON（HTML 200）时抛异常。

## 修复

1. `getSupabase()`：优先读运行时 `window.__SUPABASE_CONFIG__`，回退构建期 `NEXT_PUBLIC_CODER_SUPABASE_*`；
   只使用 anon key（公开，安全由 RLS 保证），绝不读取/暴露 service-role。
2. `AuthGuard`：等待运行时配置就绪（监听 `supabase-config-ready` 事件 + 8s 超时降级）；
   `evaluate` 全程 try/catch；游客预览 `/preview/*` 直接放行；失败关闭——展示中文错误 + 重试，不再永久空白。
3. `resolveLoginDestination()`：`response.json()` 加 try/catch，坏 JSON/非 JSON/302/401/网络/超时统一安全回 `/login` + 提示，
   保留 entry 与 `practice=1` 语义，不循环。

## 测试

- 定向 `tests/login-init.test.ts` + `tests/login-dual-entry.test.ts`：**18 pass / 0 fail**
- `ts-check` 0 / `lint` 0 / 全量 **116 pass / 1 fail**（唯一失败为预存在「深度思考」测试，与本次无关）/ `build` 0

## 边界

- 未做真实多身份全流程/权限验收（沙箱无真实 JWT 与生产 DB）。
- 生产是否缺少 `NEXT_PUBLIC_CODER_SUPABASE_*` 注入仍未证实；本修复通过复用运行时配置源
  `window.__SUPABASE_CONFIG__` 消除对该构建期变量的依赖，从而规避该不确定性。

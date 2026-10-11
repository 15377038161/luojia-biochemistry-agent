# 登录初始化公开路由卡死修复说明

> 日期：2026-10-12
> 基线提交：`4a94ab0dd9e47151acb7d4840a02d78b13b683f2`（修复前 HEAD，即当前生产版本）
> 快照分支：`backup/before-login-init-race-fix-20261012`
> 范围：登录页/首页公开路由的客户端初始化——消除「正在加载」卡死，受保护页失败关闭。
> 不新增鉴权体系，不修改 DDL / RLS / 密钥 / 权限，不暴露 service-role。

## 背景

`4a94ab0` 部署后，真实新标签访问 `/login` 首次显示「正在加载…」超过 10 秒仍不出现登录按钮，
console error/warn 为空。静态资源与 `/api/supabase-config` 经生产 HTTP 实测均 200 正常返回，
排除网关阻断/资源缺失。

## 根因（已证实 / 候选 分列）

### 已证实（代码级，附文件）

1. `/login` 公开路由无 fast-path：`AuthGuard` 仅对 `/preview/*` 直通放行，`/login` 与 `/` 仍走
   `waitForSupabaseConfig()`（固定 8 秒）+ `getSession()` 完整流程，未登录用户首次访问被
   「正在加载…」遮挡。
2. `getSession()` 无超时：`supabase.ts` 配置 `autoRefreshToken: true, persistSession: true`，
   `auth-guard.tsx` 的 `getSession()` 无 `AbortSignal`/`Promise.race` 兜底，一旦 token 刷新请求
   挂起，`status` 永远 `'loading'` 且不抛错（不进 catch、console 无报错），与「10 秒+ 仍 loading
   + console 无报错」现象一致。
3. `waitForSupabaseConfig` 固定 8 秒兜底：即便配置 API 实测 0.116s 就绪，事件时序异常时登录页
   也要白等满 8 秒。

### 候选（未证实，不写为生产根因）

- 生产 localStorage 是否残留 stale session 触发 token 刷新挂起 —— 沙箱无法读取生产 localStorage，**未证实**。
- 生产是否缺少 `NEXT_PUBLIC_CODER_SUPABASE_*` 注入 —— 沙箱两套变量已存在，生产缺少变量**未证实**。
- turbopack chunk 是否证明 dev 模式 —— 生产 build 也可产出 turbopack chunk，**不据此定根因**。

## 修复

1. `src/lib/auth.ts` 新增可测试纯函数：
   - `isPublicRoute(pathname)`：`/`、`/login`、`/preview/*` 判定为公开路由。
   - `withTimeout(promise, ms)`：Promise.race 超时兜底，超时后旧结果被忽略（`getSession` 不支持
     `AbortSignal`，无法真正取消底层请求，用 race + reject 保证调用方不被无限挂起）。
2. `src/components/auth-guard.tsx` 重写：
   - 公开路由（`/`、`/login`、`/preview/*`）**立即 `ready` 渲染**，session 检查放后台
     （`backgroundSessionCheck`，失败静默忽略，登录按钮仍可用）。
   - 受保护路由：等运行时配置 + `getSession()`（`withTimeout` 5 秒独立超时），未确认身份**绝不放行**；
     超时/失败 → 失败关闭：中文错误 + 「重试」+「返回登录」。
   - `runId` + `cancelled` 双重防护，杜绝旧 promise 结果覆盖新状态、unmount 后 setState、重定向循环。
3. `resolveLoginDestination()` 保持不变（上一轮已含 JSON 解析兜底 + 5 秒超时），保留
   teacher/student 入口与 `practice=1` 语义。

## 测试

- 定向 `tests/login-init-race.test.ts`：withTimeout 真实异步（永不 settle / late resolve / 快速 resolve）、
  isPublicRoute 判定、AuthGuard 契约、resolveLoginDestination 身份分流契约。
- `ts-check` / `lint` / 全量 test / `build` 退出码见提交记录。

## 边界

- 未做真实多身份全流程/权限验收（沙箱无真实 JWT 与生产 DB）。
- 公开路由后台 session 检查失败静默忽略，符合「公开页不因初始化失败阻塞」目标；
  但已登录用户在公开页的自动跳转依赖后台检查成功，失败时停留公开页（可手动操作）。

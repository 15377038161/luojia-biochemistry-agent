# 修复跨浏览器登录会话建立失败

## 概述

针对公开域名登录回调统一跳转到 `/auth/error?reason=session_failed` 的问题，定位并修复“超星身份校验成功后，本地 Supabase 会话未建立”的服务端链路。重点覆盖用户创建/资料同步、Magic Link `verifyOtp`、Cookie 写回和公网域名配置；不把问题归因于单个浏览器，也不改变现有超星身份与角色授权规则。平台为 web（Next.js 16 App Router），涉及 Supabase Auth 与现有 Supabase 数据访问。

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| 失败定位 | 在回调的各个阶段记录结构化、脱敏的阶段标识与 Supabase 错误码 | 当前所有异常都被压成 `session_failed`，无法判断是用户同步、生成链接、OTP 还是 Cookie 写回失败 |
| 会话建立 | 保留服务端 `generateLink` + `verifyOtp`，修复实际失败阶段并校验回调域名 | 现有方案避免把 access token 暴露到 URL，且已经与项目 SSR Cookie 体系配套 |
| Cookie 策略 | 继续使用单个 `coze-supabase-auth` Cookie 与 `tokens-only` 编码，核对生产 Secure/域名/响应写回 | Coze 网关不可靠支持多个 Set-Cookie，不能退回分块 Cookie 或把 token 放到前端参数 |
| 数据同步 | 继续使用正式 Schema 的 `profiles`、`enrollments`、`external_identities`，不新增废弃字段或 RPC | 必须遵守项目生产数据模型与现有角色授权约定 |
| 错误反馈 | 用户端保留通用安全文案，服务端日志区分阶段和错误分类 | 不向页面泄露密钥、数据库详情或内部配置，同时便于线上排查 |
| 验收方式 | 预览/构建检查 + 真实公开域名登录主路径验证 | 构建通过不能证明 Cookie 和跨跳转会话真正可用 |

## 功能模块

### 模块 1：认证回调阶段诊断

- 为 `finishChaoxingLogin` 拆分并标记阶段：身份解析、Supabase 用户映射、Magic Link 生成、OTP 校验、响应 Cookie 应用。
- 日志只记录阶段、Supabase 错误 code/status/message 的安全摘要、匿名用户标识（禁止记录 token、hashed token、密钥和完整身份资料）。
- 保持 `session_failed` 对外文案不变，避免把内部实现细节暴露给未登录用户。

### 模块 2：Supabase 用户映射与正式 Schema 同步

- 检查 `createSupabaseLoginToken` 的幂等路径：已存在用户时必须正确取得用户 ID，再生成链接和更新元数据。
- 校验 `profiles`、`enrollments`、`external_identities` 的字段与唯一约束，确保重复登录不会因 upsert 冲突失败。
- 保持 `profiles.role`、超星原始角色和 `enrollments` 的现有授权逻辑，不使用前端参数授予教师权限。

### 模块 3：Magic Link 与回调域名配置

- 核对 `generateLink` 返回的 `hashed_token` 与 `verifyOtp({ type: 'magiclink' })` 的使用顺序、过期/重复使用行为。
- 核对 Supabase Auth 的 Site URL/允许回调地址与当前公开 Coze 域名一致，避免生成链接或 OTP 校验落到错误项目/错误域名。
- 核对 `getRealOrigin`、`COZE_PROJECT_DOMAIN_DEFAULT` 和反向代理请求头的优先级，确保最终重定向为当前公开站点。

### 模块 4：会话 Cookie 写回与登录后读取

- 检查生产环境 `Secure` 判定、`SameSite=Lax`、`path=/`、自定义 Cookie 名称与浏览器端/服务端读取配置是否一致。
- 验证回调响应是否同时完成 Supabase Cookie 写回与登录上下文清理，避免清理逻辑覆盖会话 Cookie。
- 保持单 Cookie 限制；若 JWT 仍超出限制，基于真实日志精简 metadata，不添加兼容性垃圾或静默降级。

### 模块 5：回归验证与运维信息

- 覆盖首次登录、同一用户重复登录、不同浏览器/访客模式、登录后刷新、退出后再次登录。
- 验证失败时页面仍显示安全通用文案，线上日志能直接指出失败阶段。
- 若发现是外部 Supabase 配置或数据库约束问题，在交付说明中列出需要管理员修正的真实配置，不用 Mock 冒充已修复。

## 是否有原型设计

是

## 实施步骤

### 阶段一：原型设计

1. **设计登录失败与重试反馈原型**：加载 `design-canvas` 技能，基于现有登录错误页补充“失败原因可理解、返回登录、重试提示”的状态表现，并完成原型验收等待用户确认。涉及 `.cozeproj/prototype/web/`、`.cozeproj/documents/plan.md`。

### 阶段二：代码开发

2. **完成项目认证配置对账**：读取现有认证实现和运行配置，确认 `.coze`、部署配置、Supabase Auth 真实配置及公开域名事实，不修改稳定 `sub_id`。涉及 `.coze`、`AGENTS.md`、认证配置。
3. **加入回调分阶段诊断**：在 `src/app/api/auth/callback/chaoxing/route.ts` 与 `src/lib/supabase-chaoxing-user.ts` 增加脱敏阶段日志和明确错误边界，定位真实失败点。涉及 `route.ts`、`supabase-chaoxing-user.ts`、`login-error.ts`。
4. **修复真实会话建立根因**：依据阶段日志修正用户幂等同步、Magic Link/OTP 校验或生产域名/Cookie 写回问题，保持正式 Schema 和现有角色安全边界。涉及 `supabase-chaoxing-user.ts`、`supabase-ssr.ts`、`auth-utils.ts`（按实际根因取必要文件）。
5. **完善认证错误页的可操作反馈**：按原型实现重试/返回登录的清晰状态，不展示内部错误详情，并确保错误页不会误导用户认为是浏览器封禁。涉及 `src/app/auth/error/page.tsx`、`src/lib/login-error.ts`。
6. **执行配置、构建与真实登录验收**：运行类型检查、lint、构建和公开域名登录主路径，分别验证首次登录、重复登录、访客模式、刷新和退出重登；若外部配置仍阻塞则记录具体阶段和后续动作。涉及 `scripts/validate.sh`、认证回调链路、预览配置。
7. **开发产物与原型一致性检查**：按 design-canvas 规范运行 CSS 变量迁移完整性检查与 `check_style.js`，对照原型确认错误页布局、文案和交互一致，并更新 `AGENTS.md` 记录最终认证链路与已知配置要求。涉及 `AGENTS.md`、原型文件、认证错误页。

## 页面规格

### 全局导航

##### @nav(web-topbar)
> type: topbar
> platform: web

- @page(/) 实验首页

### 页面详情

##### @page(/auth/error) 登录错误页

**核心职责**：明确告知用户登录失败类型，并提供安全、可重复执行的返回登录操作。
**访问路径**：由认证回调失败后进入；缺少 `reason` 时按通用登录失败状态降级。
**布局**：保留现有科研教育背景与居中错误卡片；卡片包含状态图标、标题、简洁说明和主操作按钮，避免暴露服务端错误细节。
**状态**：
- 默认：根据 `reason` 展示“会话建立失败”等用户可理解文案。
- 无效 reason：展示通用“登录失败，请返回登录页重试”。
- 重试：返回登录入口并重新发起完整授权流程，不复用旧授权码。

**交互说明**

| 元素 | 动作 | 响应 | 传参 | 备注 |
|---|---|---|---|---|
| 返回登录页按钮 | 点击 | 跳转登录入口并重新发起认证 | — | 不直接重放旧 callback URL |
| 错误说明区域 | 查看 | 展示对应原因的安全文案 | reason | 不展示 Supabase 原始错误、token 或配置值 |
| 页面 Logo/品牌区域 | 点击 | 跳转 `@page(/)` | — | 仅当原型保留可点击品牌入口时启用 |

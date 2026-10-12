# 平台 OAuth 超星角色与工号透传需求说明

> 面向：平台侧（OAuth 统一认证代理 / Supabase Auth 写入方 / 平台管理员）
> 提出方：武汉大学生物化学实验项目（教师端登录失效阻塞）
> 状态：待平台管理员确认接入条件
> 最后更新：2026-11

---

## 1. 问题定位（一句话）

平台 OAuth 登录后，超星的**角色（roleId）**与**工号/学号（name）**没有透传到 Supabase Auth 的 metadata 中，导致项目侧无法判定「教师 / 学生」身份，教师账号登录后永远落入学生端。

## 2. 官方接口契约（已确认）

依据超星官方文档，解决教师识别的正确接口与字段契约如下，**必须以这两个为准，不要使用旁边标注「无角色」的接口**：

| 用途 | 官方文档地址 | 关键返回字段 |
|---|---|---|
| 含角色用户信息接口 | `https://auth.chaoxing.com/open/doc/list/yluywps0/zpsakobd/y4l4kl08` | `userInfo.role[].roleId/roleName`、`name`（学工号）、`displayName`（姓名）、`uid`、`fid`、`orgName`、`loginNames` |
| 令牌获取接口 | `https://auth.chaoxing.com/open/doc/list/yluywps0/zpsakobd/asptr23d` | `access_token` / `openid` / `expires_time` 等 |

> ⚠️ **接口契约核对提示**：超星文档页面上「用户信息」接口的链接显示地址与实际 href 不一致，请以**文档正文的接口契约**为准核对，不要盲目跟随页面上的超链接调用。

> ⚠️ **接口存在 ≠ 当前项目已获授权**：以上接口文档存在，不代表本项目已获授权调用。是否已授权、走哪条接入路径，需平台管理员确认（见 §4）。

## 3. 当前登录链路与缺失点

当前登录链路（`src/lib/auth.ts`）：

```
前端 loginWithChaoxingOAuth()
  → 平台代理 /v1/api/coder/proxy/auth/chaoxing-oauth/authorize-url
  → 超星授权回调
  → 平台代理 /v1/api/coder/proxy/auth/chaoxing-oauth/exchange
  → 平台服务端换取 session，写入 Supabase Auth
```

已确认的 Supabase Auth metadata 实况（教师账号 uid=488390063）：

```json
{
  "app_metadata": { "provider": "email", "providers": ["email"] },
  "user_metadata": {
    "cxid": "488390063",
    "email_verified": true,
    "provider": "chaoxing",
    "realname": "æµè¯è´¦å·1"   // 乱码，见 §5
  }
}
```

**结论**：平台目前只透传 `cxid`（超星 uid）与 `realname`（姓名，且乱码），缺失 `role[]`、`name`（工号）、`fid`、`orgName`、`loginNames`。

项目侧 `src/lib/supabase-auth.ts` 的 `normalizeUser()` 已兼容读取上述字段，字段一旦到位即可恢复教师识别，无需改代码。

## 4. 接入条件收敛（二选一，需平台管理员确认）

### 路径 A：平台代理透传（推荐，改动最小）

**前置条件**：平台 OAuth 代理已获授权调用 §2 的含角色接口，且能在**服务端**（exchange 阶段）调用该接口。

**平台管理员需要完成**：
1. 确认平台代理对含角色接口（`y4l4kl08`）和令牌接口（`asptr23d`）已获授权。
2. 在 exchange 换取 session 后，服务端调用含角色接口，把以下字段写入 Supabase Auth 的 `user_metadata`（或 `app_metadata`），字段名保持一致：
   - `role`（数组，`[{ roleId, roleName }]`）
   - `name`（工号/学号）
   - `displayName`（姓名，或继续用 `realname`，但需修复编码）
   - `fid`、`orgName`、`loginNames`
3. 修复 `realname` 的 UTF-8 编码乱码（§5）。

### 路径 B：项目独立 appid/secret + 回调登记

**前置条件**：平台无法在代理侧透传，转由项目自持超星独立应用。

**平台管理员需要完成**：
1. 为项目在超星开放平台登记独立应用，签发 `appid` 与 `secret`，并登记回调地址（`redirect_uri` 指向当前部署域）。
2. 确认该应用已获授权调用 §2 的含角色接口与令牌接口。
3. 向项目侧交付 `CHAOXING_APPID` / `CHAOXING_SECRET` / `CHAOXING_FIDS` / `CHAOXING_REDIRECT_URI` 四个环境变量（仅注入服务端，不得进入前端或聊天）。

> 项目侧 `src/lib/chaoxing-client.ts` 已实现完整 OAuth 流程（`resolveChaoxingIdentity` 会调用令牌接口 + 含角色接口解析 role/name），路径 B 只需补齐环境变量并把该函数接回登录链路（当前为历史遗留死代码）。

## 5. 附带 bug：姓名编码错误

当前 `realname` 透传为 mojibake 乱码（`"æµè¯è´¦å·1"`），是 UTF-8 中文被错误按 Latin-1 解码所致。平台写入 `realname` 时应保证 UTF-8 正确编码，否则前端姓名显示乱码。

## 6. 安全红线（不可违反）

- **不得拿 Supabase JWT 调用超星接口**：Supabase 的 access_token 不是超星凭证，两者不可混用。
- **不得向前端或聊天输出超星令牌与 secret**：`CHAOXING_SECRET`、超星 `access_token` 等敏感值只允许存在于服务端环境变量，绝不进入前端 bundle、日志或对话。
- **接口存在 ≠ 已授权**：在平台管理员确认授权前，不得假设项目可以调用 §2 接口。

## 7. 验收标准（接入完成后，项目侧可立即验证）

1. 教师账号登录后，`/api/auth/me` 的 metadata 能读到 `role[].roleId` 与 `name`（工号）。
2. 项目配置 `CHAOXING_TEACHER_ROLE_IDS`（或工号白名单）后，教师账号进入 `/teacher/dashboard`。
3. 学生账号登录后仍进入 `/student/map`，且无法访问教师路由（403）。
4. 姓名 `realname` 不再乱码。

## 8. 项目侧已就绪、待字段到位即可恢复的代码

- `src/lib/supabase-auth.ts`：`normalizeUser()` 已兼容读取 `user_metadata` / `app_metadata.chaoxing` 两处字段（含 `role`、`name`、`fid`、`orgName` 等）。
- `src/lib/chaoxing-client.ts`：完整 OAuth 流程与含角色接口解析（路径 B 用）。
- 旧写入逻辑 `buildCompactChaoxingClaims()` / `createSupabaseLoginToken()` 可从 git 历史（commit `b7653cc` 前）恢复，用于字段契约对齐。

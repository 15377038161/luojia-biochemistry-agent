# 平台 OAuth 超星角色与工号透传需求说明

> 面向：平台侧（OAuth 统一认证代理 / Supabase Auth 写入方）
> 提出方：武汉大学生物化学实验项目（教师端登录失效阻塞）
> 状态：待平台侧补充
> 最后更新：2026-11

---

## 1. 问题定位（一句话）

平台 OAuth 登录后，超星的**角色（roleId）**与**工号/学号（name）**没有透传到 Supabase Auth 的 metadata 中，导致项目侧无法判定「教师 / 学生」身份，教师账号登录后永远落入学生端。

## 2. 已确认证据

用教师账号（超星 uid=`488390063`）登录后，`/api/auth/me` 读取到的实际 metadata 为：

```json
{
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "cxid": "488390063",
    "email_verified": true,
    "provider": "chaoxing",
    "realname": "测试账号1"
  }
}
```

**结论**：平台目前只透传了 `cxid`（超星 uid）和 `realname`（姓名）两个超星字段，缺失：

- 超星角色数组 `role[]`（含 `roleId` / `roleName`）
- 工号 / 学号 `name`（超星字段语义：`name` 是学工号，`displayName` 才是姓名）
- 机构 `fid` / `orgName`
- 手机号 / 电话号（如有）

## 3. 需要的字段清单（精确到字段名）

依据超星 `getUserByTokenFormMooc` 接口的官方字段契约，请平台在 OAuth 换取 session 后，把以下字段一并写入 Supabase Auth 的 `user_metadata`（或 `app_metadata`）：

| 超星字段 | 含义 | 用途 | 是否当前缺失 |
|---|---:|---|---|
| `cxid`（或 `uid`） | 超星用户 ID | 用户唯一标识 | ✅ 已透传 |
| `realname`（或 `displayName`） | 姓名 | 展示 | ✅ 已透传（有编码 bug，见 §5） |
| `name` | 工号 / 学号（登录名） | **工号白名单判定教师** | ❌ 缺失 |
| `role[].roleId` | 稳定角色 ID | **角色白名单判定教师** | ❌ 缺失 |
| `role[].roleName` | 角色名 | 展示 / 审计留痕 | ❌ 缺失 |
| `fid` | 机构 FID | 机构限定 | ❌ 缺失 |
| `orgName` | 单位名 | 展示 | ❌ 缺失 |
| `loginNames` | 单位下登录名 | 备用匹配 | ❌ 缺失 |
| `phone`（如有） | 手机号 | 电话号白名单 | ❌ 缺失（需确认超星是否返回） |

> ⚠️ 关于电话号：超星 `getUserByTokenFormMooc` 的已确认返回字段中**未明确包含手机号字段**。若平台能取到超星手机号（如通过其它已获批接口），请一并透传；若取不到，请在需求确认时明确告知，项目侧改用 `name`（工号）白名单。

## 4. 期望的 metadata 结构（参考项目旧实现）

项目历史上（平台 OAuth 迁移前）由 `supabase-chaoxing-user.ts` 的 `buildCompactChaoxingClaims()` 写入的 `app_metadata` 结构如下，可作为平台透传的字段对齐参考：

```json
{
  "provider": "chaoxing",
  "app": { "role": "teacher", "roleSource": "chaoxing_role_id" },
  "chaoxing": {
    "openid": "<openid>",
    "uid": "488390063",
    "name": "2026111111",
    "displayName": "测试账号1",
    "fid": "<fid>",
    "orgName": "<orgName>",
    "role": [
      { "roleId": "<教师roleId>", "roleName": "教师" }
    ]
  }
}
```

平台可写入 `user_metadata` 或 `app_metadata` 任意一处，但**字段名请保持一致**，项目侧 `normalizeUser()` 已同时兼容两处读取（优先 `user_metadata`）。

## 5. 附带 bug：姓名编码错误（需一并修复）

当前 `realname` 透传为 `"测试账号1"`，但实际读取到的是 mojibake 乱码：

```
"realname": "æµè¯è´¦å·1"
```

这是 UTF-8 的中文被错误地按 Latin-1 解码所致。平台在写入 `realname` 时应保证 UTF-8 正确编码，否则前端姓名显示为乱码。

## 6. 验收标准（平台补齐后，项目侧可立即完成以下验证）

1. 教师账号登录后，`/api/auth/me` 的 metadata 中能读到 `role[].roleId` 与 `name`（工号）。
2. 项目配置 `CHAOXING_TEACHER_ROLE_IDS`（或工号白名单）后，教师账号进入 `/teacher/dashboard`。
3. 学生账号登录后仍进入 `/student/map`，且无法访问教师路由（403）。
4. 姓名 `realname` 不再乱码。

## 7. 项目侧已就绪、待平台字段到位后即可恢复的代码

- `src/lib/supabase-auth.ts`：`normalizeUser()` 已兼容读取 `user_metadata` / `app_metadata.chaoxing` 两处字段（含 `role`、`name`、`fid`、`orgName` 等）。
- 旧写入逻辑 `buildCompactChaoxingClaims()` / `createSupabaseLoginToken()` 的历史实现可从 git（commit `b7653cc` 前）恢复，用于对齐字段契约。

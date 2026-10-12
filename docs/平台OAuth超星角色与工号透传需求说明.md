# 平台 OAuth 超星角色与工号透传接入请求

> 本文档可直接转交平台管理员 / OAuth 统一认证代理负责人。
> 提出方：武汉大学生物化学实验项目（教师端登录失效阻塞）
> 方向：**平台代理透传超星可信角色（首选）**；项目独立直连为备选（见 §6）。
> 最后更新：2026-10-12

---

## 1. 项目标识

| 项 | 值 |
|---|---|
| 项目 ID | `cae90badb4a238c2c1c09848381bd4ae` |
| 稳定正式域名 | `https://app-hj14vv99j7b4.cxiagents.com` |
| 说明 | 回调登记一律使用**稳定正式域名**，不得使用 sandbox 预览地址（沙箱重建会变） |

## 2. 问题定位（一句话）

平台 OAuth 登录后，超星的**角色（roleId）**与**工号/学号（name）**没有透传到 Supabase Auth 的 metadata，导致项目侧无法判定「教师 / 学生」身份，教师账号登录后永远落入学生端。

## 3. 官方接口契约（平台侧据此调用）

| 用途 | 官方文档地址 | 关键返回字段 |
|---|---|---|
| 含角色用户信息接口 | `https://auth.chaoxing.com/open/doc/list/yluywps0/zpsakobd/y4l4kl08` | `userInfo.role[].roleId/roleName`、`name`（学工号）、`displayName`（姓名）、`uid`、`fid`、`orgName`、`loginNames` |
| 网页授权令牌接口 | `https://auth.chaoxing.com/open/doc/list/yluywps0/zpsakobd/asptr23d` | `access_token` / `openid` / `expires_time` / `refresh_token` / `scope` |

> ⚠️ 用户信息文档页面上「用户信息」接口的链接显示地址与实际 href 不一致，请以**文档正文契约**为准，不要盲目跟随页面超链接。
> ⚠️ 不要使用旁边标注「无角色」的接口。

## 4. 平台需要透传的字段（精确清单）

请在平台服务端（exchange 换取 session 后）调用 §3 含角色接口，并把以下字段写入 **不可由用户篡改的位置**（`app_metadata` 或服务端专用身份记录），字段名保持一致：

| 字段 | 含义 | 必须来自 | 用途 |
|---|---|---|---|
| `role[].roleId` | 稳定角色 ID | 服务端验证的超星响应 | **教师角色白名单判定** |
| `role[].roleName` | 角色名 | 同上 | 展示 / 审计留痕 |
| `name` | 工号 / 学号（登录名） | 同上 | 身份展示与备用匹配 |
| `displayName` | 姓名 | 同上 | 展示（注意与 name 分离） |
| `uid` | 超星用户 ID | 同上 | 用户唯一标识 |
| `fid` | 机构 FID | 同上 | 机构约束（**不单独授予教师**） |

> 若平台同时把 `orgName`、`loginNames` 一并透传更佳，但非阻塞项。

## 5. 安全与信任要求（不可违反）

1. **字段必须来自服务端验证的超星响应或平台受保护的服务端透传**，绝不接受用户可自行编辑的 `user_metadata` 里的 role/fid 作为授权依据。
2. **不得把超星令牌、secret 暴露给浏览器或前端**；令牌仅在平台服务端使用，项目侧只接收归一化后的角色/学号/机构字段。
3. **不得用 Supabase JWT 冒充超星令牌**调用超星接口，两者不可混用。
4. 写入位置必须不可由用户篡改（优先 `app_metadata`，或服务端专用记录）；若写入 `user_metadata`，需确认该位置对用户不可编辑。
5. 修复 `realname` 的 UTF-8 编码乱码（当前透传为 mojibake，见下方验收标准）。

## 6. 备选路径：项目独立直连（仅当平台无法透传时）

若平台无法在代理侧透传，需平台管理员完成以下确认后才能启用：

1. 确认现有 `CHAOXING_APPID` / `CHAOXING_SECRET` 是否属于**本项目获批应用**、应用授权范围、回调登记状态；**不修改可能被其他项目共用的共享应用配置**。
2. 回调地址为**拟定地址**（回调路由尚未实现，暂不可用）：
   `https://app-hj14vv99j7b4.cxiagents.com/api/auth/callback/chaoxing`
3. 确认该应用允许机构 `1385` 授权。

> 项目侧 `src/lib/chaoxing-client.ts` 已实现令牌交换 + 含角色接口解析逻辑，但 `resolveChaoxingIdentity` 当前为死代码、回调路由缺失，需管理员确认凭证有效并授权后，才能接回登录链路。

## 7. 平台需答复的事项

请平台管理员明确答复：

1. 平台代理**是否可以**在服务端调用 §3 含角色接口并透传 §4 字段？（可 / 不可）
2. 若可，**具体配置入口**是什么？（菜单 / 配置项 / 需要提交工单的对象）
3. 字段写入位置是否为 `app_metadata`（或其它不可篡改位置）？
4. 若不可，是否允许本项目走独立直连（§6），并确认现有凭证有效性？

## 8. 验收标准（字段到位后项目侧立即验证）

1. 教师账号登录后，`/api/auth/me` 能读到 `role[].roleId` 与 `name`（工号），且来自不可篡改位置。
2. 项目侧配置教师角色映射后，教师账号进入 `/teacher/dashboard`。
3. 学生账号登录后进入 `/student/map`，访问教师路由返回 403。
4. 姓名 `realname` 不再乱码。

## 9. 项目侧已就绪（字段到位即恢复，无需改代码）

- `src/lib/supabase-auth.ts`：`normalizeUser()` 已兼容读取 `user_metadata` / `app_metadata.chaoxing` 的 `role`/`name`/`fid`/`orgName` 字段。
- 教师角色映射待平台/机构管理员确认实际 `roleId` 后，由 `CHAOXING_TEACHER_ROLE_IDS`（或等价配置）落地，**不照抄其他项目 ID**。
- 数据隔离模型已就绪：`profiles.role`、`external_identities.raw_roles`、`enrollments`、`is_authorized_teacher(class_id)` RPC 均已存在，无需新增 DDL。

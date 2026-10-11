# 登录页双入口（学生 / 教师）实施说明

> 日期：2026-10-12
> 范围：登录页双入口 + 登录后基于服务端能力的安全路由 + 教师体验隔离入口接线。
> 不新增鉴权体系，不修改 DDL / RLS / 密钥 / 其他未指定功能。

## 目标

登录页区分「学生入口 / 教师入口」。入口选择是**导航偏好**（写入 sessionStorage，可被篡改），
不授予任何角色/权限。登录闭环后，跳转目标由**服务端能力**（`/api/auth/me` 的
`capabilities` + `defaultWorkspace`）作为唯一权限判据决定，偏好仅参与方向选择。

## 核心设计

### 1. 工作区 allowlist 映射（`src/lib/auth.ts`）

- `LoginWorkspace = 'student' | 'teacher'`
- `LOGIN_WORKSPACE_KEY = 'login_workspace'`（sessionStorage 键）
- `WORKSPACE_HOME`：`student → /student/map`、`teacher → /teacher/dashboard`
- `TEACHER_PRACTICE_HOME = '/student/map?practice=1'`（教师体验隔离落地路径）
- `getSelectedWorkspace()` 返回 `LoginWorkspace | null`（无偏好返回 null，区分「未选择」）
- `setSelectedWorkspace()` / `clearSelectedWorkspace()` 读写清理入口偏好
- `logout()` 退出时同步 `clearSelectedWorkspace()`，避免陈旧偏好污染下次登录

### 2. 登录后安全路由 `resolveLoginDestination()`

入口偏好 + 服务端能力（`/api/auth/me`）共同决定落地页：

| 场景 | 入口偏好 | 服务端能力 | 落地页 |
|------|---------|-----------|--------|
| 教师选学生入口 | student | teacherWorkspace=true | `/student/map?practice=1`（教师体验隔离） |
| 学生选学生入口 | student | teacherWorkspace=false | `/student/map`（正式学生） |
| 教师选教师入口 | teacher | teacherWorkspace=true | `/teacher/dashboard` |
| 学生选教师入口 | teacher | teacherWorkspace=false | `/student/map`（回退，不越权） |
| 无偏好（旧会话） | null | defaultWorkspace 决定方向 | teacher→/teacher/dashboard；student→/student/map |
| 能力查询失败 | 任意（含被篡改为 teacher） | 未知（视为无教师能力） | `/student/map`（最保守，绝不误入教师工作台） |

关键点：教师方向**必须**由服务端 `teacherWorkspace` 能力确认，否则回退学生首页；
`sessionStorage` 偏好即使被篡改为 `teacher`，也无权进入教师工作台。

### 3. 教师体验隔离入口接线

- `src/app/student/map/page.tsx` 读 `?practice=1` → `StudentRoutePage practiceMode`
- `src/components/agent/student-route-page.tsx` 透传 `practiceMode` 给 `StudentAgent`
- `StudentAgent` 在 `practiceMode=true` 时调用 `/api/teacher/practice-session`（而非 `/api/student/session`）

`practice=1` 只是前端路由提示，**不授予 teacherPractice**：
`/api/teacher/practice-session` 以 `capabilities.teacherPractice` 为判据，学生伪造该参数仍被服务端 403 拒绝。

### 4. 权限闭环（服务端天然校验，未改动，已核实）

- 教师端全部接口（overview/content/reviews/session/student/query/grade-reviews/questions/integration-status）
  均以 `capabilities.teacherWorkspace` 为判据返回 403；`practice-session` 以 `teacherPractice` 为判据。
- 学生会话创建 `/api/student/session` POST 以 `appRole !== 'student'` 拒绝教师写正式学生会话。
- 教师体验评价链路：`/api/student/evaluate` 先校验 `session.user_id === identity.user.id`（sessionId 归属），
  `agent_role === 'teacher'` 走 `recordTeacherPracticeEvaluation`（绕过 sync_outbox、学生成绩与班级统计）；
  正式学生才走 `rpc('record_text_evaluation')`（含 outbox）。
- 班级统计 `teacher-scope.ts` 显式 `agent_role='student'` 过滤，教师体验会话不进入统计。

## 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/auth.ts` | 工作区类型/allowlist/偏好读写清理 + `resolveLoginDestination()` 能力安全路由 + logout 清理 |
| `src/components/login-form.tsx` | 学生/教师双入口 radio + 持久化偏好 |
| `src/app/login.css` | `.login-entry-*` 入口选择器样式 |
| `src/components/auth-callback.tsx` | 回跳按能力解析落地页 + 导航前清理偏好 |
| `src/components/auth-guard.tsx` | 已登录访问 /login 按能力解析跳转 |
| `src/app/student/map/page.tsx` | 读 `?practice=1` 透传 practiceMode |
| `src/components/agent/student-route-page.tsx` | 新增 practiceMode prop 透传 |
| `tests/login-dual-entry.test.ts` | 真实逻辑执行 + 源码契约断言 |
| `docs/login-dual-entry-20261012.md` | 本文档 |

## 测试说明

`tests/login-dual-entry.test.ts` 分两类（前缀区分）：

- `[真实]`（3 条）：运行时逻辑执行——直接 import `auth.ts`，mock `sessionStorage`（真实 `Storage` 实现）
  与全局 `fetch`（真实 `new Response(...)`），验证 `get/set/clearSelectedWorkspace` 与
  `resolveLoginDestination` 的 7 种能力路由场景（含能力查询失败回退）。`afterEach` 恢复 mock。
- `[契约]`（6 条）：源码字符串断言——锁定教师端 403 判据、practice-session 的 teacherPractice 判据、
  学生会话创建拒绝、教师体验评价绕过 outbox + sessionId/agent_role 校验、统计 student 过滤、双入口接线。
  契约断言仅锁定接线不漂移，不代表运行时多身份权限验收（权限由服务端 403 语义保证）。

## 验收与边界

- 入口选择只决定方向，服务端 `capabilities` 是权限唯一判据，偏好被篡改不越权。
- 教师体验隔离会话（`agent_role='teacher'`）为既有后端能力，本次仅接线前端入口。
- 未推送远端；沙箱无真实 JWT 与生产数据库连接，无法实际调用 `/api/student/evaluate` 复现线上 P0，
  仅完成离线契约验证。

# 登录页双入口（学生 / 教师）实施说明

> 日期：2026-10-12
> 基线提交：`ff39651a7d65358564c900ebd36e894dc77d83a1`
> 范围：登录页双入口 + 登录后基于服务端能力的安全路由 + 教师体验隔离入口接线。
> 不新增鉴权体系，不修改 DDL / RLS / 密钥 / 其他未指定功能。
> 声明：所有契约验证为离线源码分析，未做真实多身份全流程/权限验收（沙箱无真实 JWT 与生产 DB）。

## 目标

登录页区分「学生入口 / 教师入口」。入口选择是**导航偏好**（写入 sessionStorage，可被篡改），
不授予任何角色/权限。登录闭环后，跳转目标由**服务端能力**（`/api/auth/me` 的
`capabilities` + `defaultWorkspace`）作为唯一权限判据决定，偏好仅参与方向选择。

## 核心设计变更

### 1. 入口偏好与服务端权限解耦

- 入口选择仅为**导航偏好**：写入 `sessionStorage`（可篡改），不授予任何角色/权限
- 登录后跳转目标由**服务端能力**作为唯一权限判据：从 `/api/auth/me` 读取 `capabilities` + `defaultWorkspace`

### 2. 工作区映射（Allowlist）

| 入口偏好 | 服务端能力 | 跳转目标 | 说明 |
|---|---|---|---|
| teacher | teacherWorkspace=true | `/teacher/dashboard` | 教师身份正常访问教师工作台 |
| teacher | teacherWorkspace=false | `/student/map` + notice | 学生身份选教师入口，无权限回退学生端 |
| student | teacherPractice=true | `/student/map?practice=1` | 教师身份复用学生端隔离体验路径（不写正式成绩） |
| student | teacherPractice=false | `/student/map` | 学生身份正常访问学生端 |

### 3. 安全兜底规则

1. 网络请求 `/api/auth/me` 失败（含 5 秒超时）→ 跳转 `/login` 并提示「身份校验暂不可用，请重新登录。」
2. 接口返回非 200 状态 → 跳转 `/login` 并提示「登录状态无效，请重新登录。」
3. 无入口偏好 → 以服务端 `defaultWorkspace` 作为默认方向

### 4. 关键修复项

1. 修复教师体验 `practice=1` 参数在步骤/报告页导航丢失问题
2. 移除硬编码 `POST_LOGIN_HOME`，改为动态解析服务端能力
3. 登录表单新增学生/教师入口选择 UI
4. 新增入口选择持久化、回调目标校验、权限正反测试

## 修改文件

| 文件 | 变更 |
|------|------|
| `src/lib/auth.ts` | 工作区类型/allowlist/偏好读写清理 + `resolveLoginDestination()` 能力安全路由（含 5 秒超时兜底）+ logout 清理 |
| `src/components/login-form.tsx` | 学生/教师双入口 radio + 持久化偏好 |
| `src/app/login.css` | `.login-entry-*` 入口选择器样式 |
| `src/components/auth-callback.tsx` | 回跳按能力解析落地页 + 导航前清理偏好 |
| `src/components/auth-guard.tsx` | 已登录访问 /login 按能力解析跳转（回跳进行中信号 + 挂起超时降级防白屏） |
| `src/app/student/map/page.tsx` | 读 `?practice=1` 透传 practiceMode |
| `src/components/agent/student-route-page.tsx` | 新增 practiceMode prop 透传 |
| `tests/login-dual-entry.test.ts` | 真实逻辑执行 + 源码契约断言 |
| `docs/login-dual-entry-20261012.md` | 本文档 |

## 测试验证

- 定向测试：`tests/login-dual-entry.test.ts` **11/11 通过**
  - `[真实]` 4 条：运行时执行，mock 真实 Storage + Response，`afterEach` 恢复环境
  - `[契约]` 7 条：源码静态断言验证
- 静态检查：`ts-check` 0 / `lint:build` 0
- 全量测试：110 tests → 109 pass（唯一失败为预存在「深度思考扩展字段」测试，与本次无关）
- 构建：`pnpm build` 0（`dist/server.js` 3.26KB）

## 边界说明

1. 教师体验隔离路径：`/api/teacher/practice-session`，绕过 `sync_outbox`、学生成绩与班级统计
2. 所有 `/api/teacher/*` 接口均校验 `capabilities.teacherWorkspace`，无权限返回 403
3. 学生身份访问教师 API 天然被服务端拒绝，不依赖前端拦截
4. 入口偏好可被前端篡改，但不影响权限判定——服务端 `capabilities` 是唯一判据

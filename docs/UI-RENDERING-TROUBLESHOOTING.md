# UI 页面无法渲染排查与修复报告

## 1. 结论

应用 React/Next.js 渲染链路没有发生崩溃。截图中的灰色雨云是 Coze 平台预览 iframe 的加载失败占位，不属于应用 DOM。触发链路是：登录页演示入口发起 Supabase 演示登录和重定向；固定演示账户被并发登录或 Magic Link 已消费时，认证链出现 `otp_expired`，iframe 最终显示平台占位。

修复后，登录页演示入口直接进入 `/preview/student` 和 `/preview/teacher`，绕开 iframe 内认证重定向。这两个路由挂载真实学生/教师组件，保留输入、切换、发送、查看结果等交互，不是图片或静态截图。真实 Supabase 演示登录 API 仍保留供接口联调。

## 2. 功能模块检查

| 模块 | 入口 | 结果 |
|---|---|---|
| 根页面与角色分流 | `src/app/page.tsx` | 正常；按 Supabase 会话渲染登录、学生或教师组件 |
| 学生智能体 | `src/components/agent/student-agent.tsx` | 正常；八步状态、消息、正式评阅、图片题、报告入口存在 |
| 教师智能体 | `src/components/agent/teacher-agent.tsx` | 正常；会话、自然语言查询、建议问题、统计卡存在 |
| UI 功能预览 | `src/app/preview/[role]/page.tsx` | 学生/教师均返回 200，组件标识实际出现在 HTML |
| 演示认证 | `src/app/api/demo-login/route.ts` | 单链路正常；同一固定账户并发登录会轮换刷新令牌 |
| Supabase 数据库 | `supabase/migrations/` | 业务迁移已执行；会话、步骤、消息等表可用 |
| Coze 工作流适配器 | `src/lib/coze-workflows.ts` | Schema 和调用代码完整；当前无正式工作流凭据，预览使用显式 Fixture |
| 图片上传 | `src/app/api/student/media/*` | 路由与校验存在；Supabase Storage bucket 尚未开通 |
| 超星同步/OAuth | `src/app/api/auth/chaoxing`、`src/app/api/internal/sync-chaoxing` | 路由与鉴权边界存在；正式外部凭据未配置 |

## 3. 渲染链路证据

- `/preview/student`：HTTP 200，HTML 含 `agent-app` 与“生物化学文字实验智能体”。
- `/preview/teacher`：HTTP 200，HTML 含 `teacher-app` 与“教师分析智能体”。
- Next.js CSS chunk：HTTP 200。
- 浏览器日志：HMR connected，无 JavaScript Error。
- 服务监听：`0.0.0.0:5000`。
- 服务端日志：页面与主要 API 返回 200；曾捕获 Supabase `otp_expired`，对应 iframe 认证重定向失败。
- 截图识别：雨云属于平台预览容器占位，不属于项目样式或组件。

## 4. 发现并修复的问题

### 4.1 平台 iframe 演示入口不稳定

**原因**：演示入口经 Supabase 登录及重定向进入首页；固定演示账户并发登录或 Magic Link 重复消费时，刷新令牌/Magic Link 失效。

**修复**：登录页演示按钮改为直达 `/preview/student`、`/preview/teacher`。预览环境开启 `ENABLE_UI_PREVIEW=true`。

### 4.2 ESLint 扫描受控知识材料失败

**原因**：原始教师材料目录中存在字符编码异常的目录项，ESLint 文件系统遍历报 `ENOENT`。

**修复**：在 `eslint.config.mjs` 忽略 `knowledge-base/raw-teacher-materials/**`。该目录是二进制/受控原始材料，不属于 TypeScript/JavaScript 静态检查范围。

### 4.3 Next.js 工作区根推断告警

**原因**：上级环境存在其他 lockfile，Next.js 推断了错误 workspace root。

**修复**：`next.config.ts` 设置 `turbopack.root = process.cwd()`。

### 4.4 学生输入 Enter 行为不明确

**修复**：学生输入框支持 Enter 发送、Shift+Enter 换行，与实际功能页交互一致。

### 4.5 全流程测试会话竞争

**原因**：并行测试重复登录同一演示账户，使 Supabase 刷新令牌互相失效，产生间歇性 401。

**修复**：新增 `tests/full-flow.sh`，单命令串行执行学生登录、会话、消息、图片题、上传边界、评阅、报告、登出、教师会话/查询和 UI 页面标识验证。

## 5. 验证结果

- TypeScript：通过。
- ESLint：通过。
- 自动化领域测试：6/6 通过。
- Next.js 生产构建：通过。
- 学生完整串行流程：通过。
- 教师完整串行流程：通过。
- 学生/教师 UI SSR 标识：通过。
- 浏览器 console：未发现 Error。
- 服务端 app log：未发现应用崩溃错误。

## 6. 外部依赖缺口

以下不是当前 UI 渲染根因，但会限制相应正式能力：

1. 正式 Coze 工作流 ID/Token 未配置。当前预览通过 `ENABLE_AI_FIXTURE=true` 验证结构和流程；生产必须关闭 Fixture。
2. Supabase Storage 中没有 `student-media`、`course-assets` bucket，真实图片上传不可用。
3. 超星 APPID/APPKEY、表单写入地址、Token、Worker Secret 未配置，正式 OAuth 和同步不可用。

## 7. 全量功能与交互验收矩阵

| 区域 | 功能 / 交互 | 验证方式 | 结果 |
|---|---|---|---|
| 首页 | 游客模式按钮、登录页主体 | SSR 标识与可访问属性检查 | 通过 |
| 游客弹窗 | 打开、遮罩关闭、关闭按钮、Escape、滚动锁定、焦点回归 | 组件逻辑审计 + TypeScript/ESLint | 通过 |
| 游客弹窗 | 学生端、教师端入口 | Next.js Link 路由审计 + 目标页 HTTP 200 | 通过 |
| 学生端 | 八步路线、快捷提问、普通问答、正式评阅、图片题、报告 | 真实组件 preview 状态审计 + 认证 API 串行回归 | 通过 |
| 学生端 | 图片上传 | API 边界响应验证 | 受外部 Storage bucket 限制，错误可控 |
| 教师端 | 建议问题、自定义查询、证据查看、后续问题 | preview 状态审计 + 教师 API 串行回归 | 通过 |
| 教师端 | 平板宽度证据面板 | 抽屉打开/关闭状态与响应式 CSS 审计 | 通过 |
| 路由 | `/preview/student`、`/preview/teacher` | HTTP 200 + 页面标识 | 通过 |
| 路由 | `/preview/invalid` | HTTP 404 | 通过 |
| 认证 | 学生登录、身份查询、退出、教师登录 | 固定演示账户串行回归 | 通过 |
| 数据接口 | 学生会话、消息、图片题、评阅、报告 | `tests/full-flow.sh` | 通过 |
| 数据接口 | 教师会话、查询、复核参数校验 | `tests/full-flow.sh` | 通过 |
| 样式 | 隐藏、层级、零宽高、响应式断点 | 全局 CSS 静态审计 | 无阻塞项 |
| 工程 | TypeScript、ESLint、领域测试、生产构建 | `pnpm validate`、`pnpm test`、`pnpm build` | 全部通过 |

明确禁用且有界面说明的“资料包”“历史记录”等未开放能力不作为失效按钮；它们不会误导用户触发未实现流程。

## 8. 本轮问题、修复与责任

| 问题 | 修复方案 | 责任人 | 验证结果 |
|---|---|---|---|
| 首页演示入口不能集中选择角色 | 增加游客模式悬浮窗口，提供学生和教师两个入口 | Vibe Coding 工程专家 | 通过 |
| 游客弹窗缺少项目视觉样式 | 按实验记录册风格补齐桌面/移动布局、焦点态和动效 | Vibe Coding 工程专家 | 通过 |
| 弹窗关闭后的键盘焦点丢失 | 打开时聚焦关闭按钮，关闭时恢复触发按钮焦点 | Vibe Coding 工程专家 | 通过 |
| 768–920px 下教师证据面板不可达 | 将既有状态接入抽屉 class，增加查看依据与关闭入口 | Vibe Coding 工程专家 | 通过 |
| UI 回归错误断言客户端条件渲染链接必须出现在 SSR HTML | 改为断言 SSR 触发按钮语义，并独立验证两个目标路由 | Vibe Coding 工程专家 | 通过 |

## 9. 生产可用性结论

主页面、学生端和教师端均可正常返回并渲染，学生端与教师端核心 API 流程已串行通过；当前没有阻塞 UI 渲染或核心演示流程的问题。此前看到的雨云不是应用 DOM，而是平台 iframe 加载失败占位。功能验收应从首页游客模式进入 `/preview/student` 和 `/preview/teacher`，避免在 iframe 内依赖 Magic Link 跳转。

当前可作为“核心应用与演示链生产就绪”验收通过，但以下外部集成在正式上线前仍由平台/集成负责人完成：创建 Supabase Storage bucket，配置正式 Coze 工作流 ID 与 Token，配置超星 OAuth、表单和 Worker 凭据，并关闭 `ENABLE_DEMO_ACCESS`、`ENABLE_UI_PREVIEW`、`ENABLE_AI_FIXTURE`。这些事项不会阻塞当前页面渲染，但会阻塞对应真实外部能力。

## 10. 最终回归记录（2026-08-14）

- `pnpm validate`：TypeScript 与 ESLint 通过。
- `pnpm test`：6/6 领域测试通过。
- `pnpm build`：Next.js 23 个路由构建与自定义服务端打包通过。
- `bash tests/full-flow.sh`：`student-flow:ok`、`teacher-flow:ok`、`ui-render:ok`。
- 平台验收：服务探活和全流程命令通过；重启后应用及控制台无运行错误。

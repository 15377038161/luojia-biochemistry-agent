# 武汉大学生物化学文字实验智能体

短名称“珞珈生化智能体”。同一个智能体按学习通课程身份提供学生学习模式和教师教学模式。学生不执行真实实验，而是沿 EGFP 重组克隆主线完成理论检验、八步文字推演、案例图分析、AI 证据点评、Gate 修订和学习报告；教师查看班级证据、认定成绩、维护版本化内容，并可进入不计分的独立学习体验。

这不是传统实验填报或课程管理系统。数据库、八步状态、Coze工作流、图片存储、超星表单和OAuth均是智能体的幕后能力。

## 已实现

- 统一身份：`/login` 只有一个学习通入口，服务端使用稳定角色 ID 白名单或教师授权表计算权限；学生不能进入教师路由。
- 学生智能体：普通提问、正式提交、`TextEvaluation.v2` 五维证据评阅、Gate 规则、修订、步骤推进和历史消息。
- 图片学习：使用老师提供的仪器图和结果案例图完成观察与判断；既有媒体接口保留兼容，但不进入学生主流程。
- 学习报告：`StudyReport.v2` 只读取真实步骤状态、文字回答与评阅证据；雷达图按 20/30/20/15/15 换算，解释定义、评分依据、场景、影响、成因边界、行动和检查标准。
- 成绩：八步最终 Gate 等权形成 100 分过程成绩，按 10% 折算课程贡献分；学生仅可申请一次异议，教师结论作为最终成绩。
- 教师智能体：班级概览、学生复核、成绩认定、八步内容草稿/校验/发布、素材上传和外部服务真实状态。
- 数据层：新增 `session_mode`、教师授权、内容版本、成绩组件和异议表；教师学习体验不计成绩、不进班级统计和超星 outbox。
- UI V6：珞珈蓝 `RGB(0,37,84)`、珞珈绿 `RGB(17,87,64)`为主色；首页和登录使用原创珞珈校园生化水彩，学生端保留轻量探险册，教师端使用专业工作台。

## 产品边界

- 学生提交的是实验方案和步骤描述，不是实验操作记录。
- 图片任务分析老师提供的课程案例，不要求上传真实实验结果。
- 学习报告只汇总文字推演、Gate状态与评阅，不生成或伪造正式实验数据。
- `knowledge-base/raw-teacher-materials`中的其他生化实验课件只作为知识来源，不扩展为新的主流程。

## 本地运行

1. 复制`.env.example`为`.env.local`并填写Supabase。
2. 按文件名顺序执行 `supabase/migrations/202608140001_agent_core.sql`、`supabase/migrations/202608230001_unified_agent_v2.sql` 和 `supabase/migrations/202608240001_chaoxing_sync_contract.sql`。
3. 执行`pnpm seed:content`导入八步、40个五维知识块、仪器和图片题。
4. 开发联调可设置`ENABLE_DEMO_ACCESS=true`和`ENABLE_AI_FIXTURE=true`。
5. 运行`pnpm dev`。

仅做本地 UI 验收时设置 `ENABLE_UI_PREVIEW=true`，随后访问 `/`、`/login`、`/preview/student/map` 和 `/preview/teacher/dashboard`。预览身份只能由 `/preview/*` 开发地址进入，该开关不得用于正式环境。

学生端采用多页面层级：`/student/map` 为八步任务地图，`/student/step/[stepId]` 为分步文字推演，`/student/report` 为学习报告。教师端入口为 `/teacher/dashboard`。Next.js Link 与客户端预取会预加载已解锁步骤和报告资源，路由切换期间由 `loading.tsx` 提供轻量加载状态，避免白屏。

非核心提示使用轻量抽屉/弹窗；移动端支持向下滑动关闭，桌面端支持点击遮罩、关闭按钮与 Esc。全局视觉变量、固定字号、48px 操作目标、底部安全区和低成本动效均集中在 `src/app/globals.css`，并遵循 `prefers-reduced-motion`。

V6 首页与登录使用 `public/illustrations/luojia-biochem-agent-bg-v1.webp` 及对应 8 秒 WebM/MP4 循环素材；它们是根据武大官方标识规范和本项目视觉方向原创生成的无文字素材，不拼贴官网照片。登录先显示静态 WebP，视频就绪后淡入；省流量、减少动画或加载失败时保持静态背景。视觉规范与验收见 `docs/UI-V6设计与验收记录.md`。

常用校验：

```bash
pnpm test
pnpm validate
pnpm exec next build
pnpm bundle
pwsh -File scripts/package-delivery.ps1
```

## Coze配置

在Coze创建`WF-TEXT`、`WF-VISION`和`WF-REPORT`，按照`docs/coze/`中的输入输出契约配置，然后填写三个工作流ID和服务端Token。浏览器不会接触Token。

`WF-TEXT` 同时处理两种模式：

- `evaluate`：正式评阅并返回 `TextEvaluation.v2`，每个问题包含能力维度、原文证据/场景、影响、成因边界、修订动作和检查标准。
- `tutor_question`：回答原理问题，但不改变步骤进度、不输出完整标准答案。

## 超星边界

- OAuth通过`/api/auth/chaoxing`和`/api/auth/callback/chaoxing`建立同一套Supabase Session。
- 教师身份只认 `CHAOXING_TEACHER_ROLE_IDS` 或数据库 `teacher_role_grants`，不使用角色名称猜测。
- 完整业务状态只保存在Supabase。
- 超星表单`3513491`只接收关键留痕字段；默认通过`CHAOXING_FORM_TRANSPORT=disabled`保留事件，不会误报已接通。
- 取得已发布任务流或正式API契约后，设置`CHAOXING_FORM_TRANSPORT=taskflow|api`、写入URL、Token、限流和可选回查URL；写入仍由服务端Worker异步处理。
- `GET /api/internal/chaoxing-health`仅允许同步Worker调用，用于检查配置和回查连通性，不执行写入；只有`TEST_`写入并回查一致后才可作为生产门禁通过。
- 禁止使用浏览器抓取到的内部接口作为生产写入方式。

## 安全要求

- 正式上线保持 `ENABLE_DEMO_ACCESS=false`、`ENABLE_UI_PREVIEW=false`、`ENABLE_AI_FIXTURE=false`；只有完成 OAuth 和表单回读校验后才设置 `ENABLE_CHAOXING_AUTH=true` 并启用正式写回。
- Service Role、Coze Token、超星APPKEY和同步Worker Secret不得进入Git、日志、截图或发布包。
- 学生端不返回内部rubric、数值评分和置信度；教师查询受课程授权和RLS限制。
- 老师原始DOCX/PPT仅进入受控的内部完整交付包，不进入公开源码仓库或公开下载地址；公开发布只使用结构化内容和已授权教学图片。

完整交付、部署、接口、权限、超星接入、迭代和维护说明见[docs/Coze平台交付与后续推进说明.md](docs/Coze平台交付与后续推进说明.md)。

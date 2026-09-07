# 武汉大学生物化学文字实验智能体

短名称“珞珈生化智能体”。同一个智能体按学习通课程身份提供学生学习模式和教师教学模式。学生不执行真实实验，而是沿自选目标基因（推荐 EGFP）的八步表达纯化主线完成理论检验、文字推演、案例图分析、AI 证据点评、Gate 修订和学习报告；教师查看授权班级证据、认定成绩、维护版本化内容，并可进入不计分的独立学习体验。

这不是传统实验填报或课程管理系统。数据库、八步状态、Coze工作流、图片存储、超星表单和OAuth均是智能体的幕后能力。

## 已实现

- 统一身份：`/` 同时是精简产品说明和唯一学习通入口；`/login` 只做兼容跳转。服务端使用稳定角色 ID 白名单或教师授权表计算权限，学生不能进入教师路由。
- 学生智能体：普通提问、正式提交、`TextEvaluation.v2` 五维证据评阅、Gate 规则、修订、步骤推进和历史消息。
- 图片学习：使用老师提供的仪器图和结果案例图完成观察与判断；既有媒体接口保留兼容，但不进入学生主流程。
- 学习报告：`StudyReport.v2` 只读取真实步骤状态、文字回答与评阅证据；统一由 `computeGradeSummary` 输出知识点掌握、实验操作理解、数据解读、细节把控、知识迁移应用五个 0–100 分维度，并展示原文证据、失分原因、参数遗漏、原理解析、改进答案和复核状态。
- 成绩：八步最终 Gate 等权形成 100 分过程成绩，按 10% 折算课程贡献分；学生仅可申请一次异议，教师结论作为最终成绩。
- 教师智能体：`/teacher/dashboard` 只保留教学信号；学生列表使用快速抽屉，`/teacher/students/[sessionId]` 提供五分栏完整档案；`/teacher/content/[stepId]` 按理论、SOP安全、评分Gate、资料设备、知识检验题库、预览发布分屏编辑。
- 模型网关：服务端 OpenAI Chat 兼容调用；`qwen3.8-max` 用于严肃评测、报告、教师分析和图片理解，`deepseek-v4-flash-0731` 用于高频助教和随机出题。深度思考字段不兼容时自动退回模型默认推理。
- 教师预制题库：教师在“内容管理 → 知识检验题库”中让 AI 批量生成草稿，可逐题修改题干、选项、答案和解析，审核后发布；学生开考仅抽取本人未做的已发布题，不再等待现场 AI 生成。测验仍保持单页单题、最终确认后统一批改，提交前 API 不返回答案或解析。
- 数据层：完全运行在 `202608140001_agent_core.sql` 的 Coze 原生模型上——`agent_sessions.agent_role` 区分会话类型、`content_versions` 单表承载草稿/发布、`evaluations` 是过程成绩唯一事实来源、申诉复核走 `teacher_reviews`+`agent_messages`、`sync_outbox.payload` 保存外部记录编号；教师学习体验不计成绩、不进班级统计和超星 outbox。
- 水彩课堂：保留八步地图与水彩背景，原理、测验、文字推演和报告拆为独立组件；答题和历史回顾共用逐题卡片，文字推演逐环节编辑后统一检查提交。交互契约与真实验收边界见 [水彩课堂交互与验收](docs/水彩课堂交互与验收.md)。

## 产品边界

- 学生提交的是实验方案和步骤描述，不是实验操作记录。
- 图片任务分析老师提供的课程案例，不要求上传真实实验结果。
- 学习报告只汇总文字推演、Gate状态与评阅，不生成或伪造正式实验数据。
- `knowledge-base/raw-teacher-materials`中的其他生化实验课件只作为知识来源，不扩展为新的主流程。

## 本地运行

1. 复制`.env.example`为`.env.local`并填写Supabase与服务端AI网关。Coze 会自动注入内置库的`COZE_SUPABASE_*`；如需切换到专用 Supabase，配置`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`和仅服务端可见的`SUPABASE_SERVICE_ROLE_KEY`，这组三项会显式覆盖平台注入值，三项必须来自同一个项目。AI 密钥仅填写 `AI_GATEWAY_API_KEY`，不得使用 `NEXT_PUBLIC_` 前缀。
2. 新库初始化时按文件名顺序执行 `supabase/migrations/` 中全部迁移；已投入使用的生产库不在应用运行时执行 DDL。数据映射见 `docs/数据库映射说明-Coze原生模型.md`。
3. 执行`pnpm seed:content`导入八步、40个五维知识块、仪器和图片题。
4. 开发联调可设置`ENABLE_DEMO_ACCESS=true`和`ENABLE_AI_FIXTURE=true`。
5. 运行`pnpm dev`。

仅做本地 UI 验收时设置 `ENABLE_UI_PREVIEW=true`，随后访问 `/`、`/student/map?preview=1` 和 `/teacher/dashboard?preview=1`。`/login` 与旧 `/preview/*` 地址只做兼容跳转，不再渲染第二套页面；该开关不得用于正式环境。

学生端采用多页面层级：`/student/map` 为八步任务地图，`/student/step/[stepId]` 为分步文字推演，`/student/report` 为学习报告。教师端拆分为 `/teacher/dashboard`、`/teacher/students`、`/teacher/students/[sessionId]`、`/teacher/reviews`、`/teacher/content` 和 `/teacher/content/[stepId]`。学生的专业、年级、班级优先取学习通身份/课程成员字段，缺失值明确显示为“待同步”，不得猜测。

学生概况与成绩复核使用 Radix Sheet，移动端全屏，支持关闭按钮、遮罩与 Esc，自动管理焦点。基础视觉变量在 `src/app/globals.css`；课堂纸张面板、逐题卡片、写作布局与响应式样式在 `src/app/learning-workspace.css`。文字输入时底部栏随文档流排布，避免覆盖输入区域。

首页与登录使用 `public/illustrations/luojia-biochem-agent-bg-v1.webp` 及对应 8 秒 WebM/MP4 循环素材；它们是根据武大官方标识规范和本项目视觉方向原创生成的无文字素材，不拼贴官网照片。登录先显示静态 WebP，视频就绪后淡入；省流量、减少动画或加载失败时保持静态背景。当前视觉规范与操作动线见 `docs/UI-V7统一视觉与操作动线规范.md`。

常用校验：

```bash
pnpm test
pnpm validate
pnpm exec next build
pnpm bundle
pwsh -File scripts/package-delivery.ps1
```

## AI 网关配置

```dotenv
AI_GATEWAY_API_KEY=仅部署端密钥
AI_GATEWAY_CHAT_URL=http://wg.cxcommon.com/fw/v1/chat/completions
AI_MODEL_QUALITY=qwen3.8-max
AI_MODEL_FAST=deepseek-v4-flash-0731
AI_GATEWAY_TIMEOUT_MS=120000
AI_GATEWAY_RETRY_COUNT=2
```

网关日志只允许记录模型名、耗时、运行 ID 和错误分类，禁止记录请求头、密钥或完整学生答案。共享说明中的单数路径 `/chat/completion` 在 2026-09-07 实测返回 404；当前使用 OpenAI Chat 兼容的复数路径 `/chat/completions`。若生产网络支持 HTTPS，应优先换成网关提供的 HTTPS 地址。

## Coze配置

在Coze创建`WF-TEXT`、`WF-VISION`和`WF-REPORT`，按照`docs/coze/`中的输入输出契约配置，然后填写三个工作流ID和服务端Token。浏览器不会接触Token。

`WF-TEXT` 同时处理两种模式：

- `evaluate`：正式评阅并返回 `TextEvaluation.v2`（扩展字段：strengths/missingPoints/reasoningReview/standardAnswer/improvedAnswer/knowledgeExplanation，入库时按 `evaluations.result` 契约转蛇形键），每个问题包含能力维度、原文证据/场景、影响、成因边界、修订动作和检查标准。
- `tutor_question`：回答原理问题，但不改变步骤进度、不输出完整标准答案。

## 超星边界

- OAuth通过`/api/auth/chaoxing`和`/api/auth/callback/chaoxing`建立同一套Supabase Session。
- 教师身份由服务端数据链判断：`profiles.role`（teacher/content_admin）+ `external_identities.raw_roles`（学习通原始角色留痕）+ `enrollments` + `is_authorized_teacher(class_id)` RPC；只认 `CHAOXING_TEACHER_ROLE_IDS` 白名单角色，不使用角色名称猜测，不依据前端参数授权。
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
本轮数据库权限矩阵见[docs/数据库权限与AI数据隔离矩阵.md](docs/数据库权限与AI数据隔离矩阵.md)，原教师需求验收清单见[docs/教师需求与八步功能验收清单.md](docs/教师需求与八步功能验收清单.md)。

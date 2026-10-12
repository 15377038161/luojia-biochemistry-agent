# 报告加载 / 失败重试修复（2026-10-12）

## 背景

学习报告页进入后，前端会请求 `/api/student/report`（大模型生成 markdown 全文）。原实现存在：

- **假进度**：`ReportGenerating` 用 `setInterval` 轮换固定阶段文案 + 无限气泡动画，与实际进度无关。
- **无期限等待**：前端无超时、后端 LLM 调用无超时，报告生成 30–90s 时用户无限等待。
- **失败无重试**：`reportError`/`markdownError` 只展示文案，无重试入口。

## 修复内容

### 前端（加载 / 有界等待 / 超时后只读查询 / 独立重新生成）

- `src/lib/report-loading.ts`：无副作用纯函数 `missingSteps` / `elapsedText`，前后端共用。
- `src/components/student/report-generating.tsx`：去掉伪造阶段文案，只显示「生成中」与真实已等待秒数（`elapsedText`），保留 `prefers-reduced-motion` 降级。
- `src/components/agent/student-agent.tsx`：
  - `loadReport`（POST 生成）：`withTimeout`（`REPORT_TIMEOUT_MS = 120s`）有界等待；`AbortController` + `reportRunRef` 取消与迟到结果忽略；`reportBusy` 防重复点击、`reportAttemptedRef` 防成功后自动重复。
  - `queryExistingReport`（GET 只读）：超时后「查看是否已生成」只读查询已有报告，**不调用模型、不写入**；无结果时明确提示「后台是否完成尚未可知，返回实验地图」，不盲目再 POST。
  - `retryGenerate`（POST 重新生成）：独立按钮，`reportBusy` 防并发/重复误触；与「查看是否已生成」分离。
- `src/components/student/study-report.tsx`：`markdownError` 处按 `reportTimedOut` 区分按钮——超时显示「查看是否已生成」+「重新生成」，普通错误只显示「重新生成」；返回地图由顶部 `onClose` 提供。

### 后端（POST 仅生成 / GET 只读 / 非敏感耗时 / 未完成明确）

- `src/app/api/student/report/route.ts`：
  - **POST** 仅做「生成」：`generateReport` + `record_learning_report`，不做已有报告复用。
  - **GET**（新增）只读查询最近一份 `learning_reports`（`rendered_markdown` / `content` / `version` / `created_at`），不调用模型、不写入，供超时后「查看是否已生成」使用。
  - `generateReport` 与 `record_learning_report` 阶段记录非敏感 `durationMs` + 随机 `requestId`（不含学生原文/会话/凭证）。
  - 八步未全部通过时返回 `STATE_INVALID`，明确列出未完成步骤并指引返回实验地图。

## 幂等边界（已显式关闭复用，非完成声明）

- **删除了时间戳近似缓存复用**：原 `isReportFresh` 用「报告创建时间 vs 评阅/步骤通过最新时间」判断新鲜并复用，但该近似**不感知 `teacher_reviews` 表**——教师 `record_teacher_review`（逐步复核）不改变 `evaluations`、不生成新报告版本，时间戳判断会**掩盖教师复核与新评价**，违反「不能掩盖复核」要求。
- **未实现完整 fingerprint**：无 DDL 无法安全取得「评分事实 + 内容快照 + 教师复核」的完整指纹，故**不保留危险 fallback**，直接关闭复用。
- 已有报告读取改由**显式只读 GET** 提供；是否复用由前端用户主动选择（「查看是否已生成」），后端不做自动判断。
- 无 DDL、无新增表、无新增外部资源，仅复用既有 `learning_reports`。

## 测试

`tests/report-loading.test.ts`（11 项，`pnpm exec tsx --test tests/report-loading.test.ts` 全部通过）：

- `missingSteps`：八步通过 / 部分缺失 / 空集合。
- `elapsedText`：0 秒 / 向下取整 / 时钟回拨。
- `withTimeout`：超时 reject / 迟到结果忽略 / 快速透传。
- `[契约]` 源码断言：前端 POST/GET 分离、超时后只读查询、独立重新生成；后端删除 `isReportFresh` 缓存、保留非敏感耗时与未完成拦截。

## 验证结果

| 步骤 | 退出码 |
|---|---|
| 定向测试（report-loading，11/11） | 0 |
| ts-check | 0 |
| lint:build | 0 |
| build（dist/server.js 3.26KB） | 0 |
| 全量测试（147，146 pass / 1 fail） | 1（唯一失败为已知「深度思考」项，非本次引入） |

## 未验收 / 保留待办

- 线上真实用户未验收报告加载 / 超时后只读查询 / 重新生成。
- 教师角色映射（`profiles.role` + `external_identities.raw_roles` + `enrollments` + `is_authorized_teacher(class_id)`）仍未接入 `resolveRole`，另立任务。
- 手机八步地图适配（触控 / 动效 / 375–768 响应式）另版处理。
- 第三步真实提交、教师入口真实验收仍保留。

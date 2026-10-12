# 报告加载 / 失败重试修复（2026-10-12）

## 背景

学习报告页进入后，前端会请求 `/api/student/report`（大模型生成 markdown 全文）。原实现存在：

- **假进度**：`ReportGenerating` 用 `setInterval` 轮换固定阶段文案 + 无限气泡动画，与实际进度无关。
- **无期限等待**：前端无超时、后端 LLM 调用无超时，报告生成 30–90s 时用户无限等待。
- **重复请求**：每次 POST 无条件重新调用大模型并插入新版本，刷新页面即重新付费生成。
- **失败无重试**：`reportError`/`markdownError` 只展示文案，无重试入口。

## 修复内容

### 前端（加载 / 有界等待 / 重试）

- `src/lib/report-loading.ts`（新增）：无副作用纯函数 `isReportFresh` / `missingSteps` / `elapsedText`，前后端共用。
- `src/components/student/report-generating.tsx`：去掉伪造阶段文案，只显示「生成中」与真实已等待秒数（`elapsedText`），保留 `prefers-reduced-motion` 降级。
- `src/components/agent/student-agent.tsx`：
  - `loadReport` 增加 `withTimeout`（`REPORT_TIMEOUT_MS = 120s`）有界等待；
  - `AbortController` + `reportRunRef` 实现取消（卸载/离开时停止前端等待）与迟到结果忽略；
  - `reportBusy` 防重复点击、`reportAttemptedRef` 防成功后自动重复；
  - 超时后提示「可能仍在后台生成，可重新查询，不会重复计费」，不盲目重复 POST；
  - 新增 `retryReport` 显式重试入口。
- `src/components/student/study-report.tsx`：`markdownError` 处新增「重新查询」按钮，`markdownBusy` 传入真实 `reportElapsedStart`。

### 后端（已有报告正确读取 / 非敏感耗时 / 未完成明确）

- `src/app/api/student/report/route.ts`：
  - 生成前先读最近一份 `learning_reports`，用 `isReportFresh`（报告创建时间 vs 评阅/步骤通过最新时间）判断；新鲜则**直接复用**，不再次调用大模型、不重复触发超星桥接同步；
  - `generateReport` 与 `record_learning_report` 阶段记录非敏感 `durationMs` + 随机 `requestId`（不含学生原文/会话/凭证）；
  - 八步未全部通过时返回 `STATE_INVALID`，明确列出未完成步骤并指引返回实验地图。

## 幂等边界（明确限制，非完成声明）

- 新鲜度判断是**时间戳近似**（报告创建时间不早于最新评阅/步骤通过时间），**不感知 `teacher_reviews` 表**（教师复核走独立 grade 流程，缓存不会掩盖复核，但也不会因复核自动失效）。
- **不提供跨实例并发幂等**：两个并发请求同时「未命中缓存」时仍可能各触发一次大模型生成（`record_learning_report` 的 `unique(session_id, version)` 会在并发插入时约束版本，但无法去重 LLM 调用）。
- 无 DDL、无新增表、无新增外部资源，仅复用既有 `learning_reports` 与 `record_learning_report`。

## 测试

`tests/report-loading.test.ts`（17 项，`pnpm exec tsx --test tests/report-loading.test.ts` 全部通过）：

- `isReportFresh`：无报告 / 新鲜 / 新评阅失效 / 新步骤失效 / 非法时间 / 无事实。
- `missingSteps`：八步通过 / 部分缺失 / 空集合。
- `elapsedText`：0 秒 / 向下取整 / 时钟回拨。
- `withTimeout`：超时 reject / 迟到结果忽略 / 快速透传。
- `[契约]` 源码断言：前端防重复/迟到/取消/超时/重试接线，后端复用/日志/未完成拦截接线。

## 验证结果

| 步骤 | 退出码 |
|---|---|
| 定向测试（report-loading，17/17） | 0 |
| ts-check | 0 |
| lint:build | 0 |
| build（dist/server.js 3.26KB） | 0 |
| 全量测试（153，152 pass / 1 fail） | 1（唯一失败为已知「深度思考」项，非本次引入） |

## 未验收 / 保留待办

- 线上真实用户未验收报告加载与超时重试（本修复尚未证明消除用户实际遇到的加载卡顿根因）。
- 教师角色映射（`profiles.role` + `external_identities.raw_roles` + `enrollments` + `is_authorized_teacher(class_id)`）仍未接入 `resolveRole`，另立任务。
- 手机八步地图适配（触控 / 动效 / 375–768 响应式）另版处理。
- 后端跨实例并发幂等未完成（见上「幂等边界」）。

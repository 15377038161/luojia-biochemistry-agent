# 评阅流程性能与错误处理优化

## 概述

修复学生单步评阅/学习报告生成时"评阅时间过长"和"Unexpected token 'u', \"upstream f\"… is not valid JSON"两类问题。涉及 `src/lib/ai-gateway.ts`（LLM 调参与超时重试）、`src/lib/coze-workflows.ts`（`evaluateText` / `generateReport` 的 maxTokens 与 deepThinking）、`src/components/student/step-workstation.tsx` 与 `src/components/student/experiment-writer.tsx`（错误透出与按钮文案）。平台为 web（Next.js 16 App Router），不涉及任何外部集成调整。

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| 错误处理入口 | 在 `step-workstation.tsx` 的 `api()` 包一层 `safeApi` | 当前 `response.json()` 无 try/catch，遇到 502/504/HTML 错误页直接 SyntaxError 泄漏到 UI |
| LLM 调参 | `evaluateText` 降为 `maxTokens: 8000`、可关 `deepThinking`；`generateReport` 降为 `maxTokens: 14000` | 18k/24k tokens 配 deepThinking 极易超 60s serverless 限制或反向代理 timeout |
| 超时控制 | `ai-gateway` `timeoutMs` 从 120s 降到 45s，`retryCount` 从 2 降到 1，最坏 90s | 评阅单步应在 30s 内返回，超过即视为失败，重试不要堆 |
| 用户反馈 | `experiment-writer.tsx` 按钮文字分阶段："正在准备…" → "正在评阅…" → 错误态 | 替代单一"正在评阅，请保留页面…"，给进度感 |
| 错误文案 | `clientErrorMessage` 增强：识别 SyntaxError/HTML 错误页，给"服务暂时不可达，请稍后重试" | 当前 raw SyntaxError 透传 |

## 功能模块

### 模块 1：客户端 API 错误处理（`src/components/student/step-workstation.tsx`）

- 新增 `safeApi<T>(url, body)` 工具，封装 fetch + JSON 解析
- 解析失败时读取 `response.text()` 截前 120 字符，识别 502/503/504 → 抛 `Error("服务暂时不可达（HTTP 502），请稍后重试")`；其他 → 抛 `Error("评阅服务返回异常，请稍后重试")`
- `clientErrorMessage` 在 `src/lib/client-request.ts` 补充 SyntaxError/JSON 错误识别分支
- `submitEvaluation` 的 catch 改为 `setError(clientErrorMessage(reason, "评阅失败，请稍后重试"))`（已经是这样，但 reason 已经被 safeApi 改写成可读文案）

### 模块 2：LLM 调参与超时（`src/lib/ai-gateway.ts` + `src/lib/coze-workflows.ts`）

- `ai-gateway.ts`：
  - `timeoutMs` 默认 45_000（环境变量可覆盖）
  - `retryCount` 默认 1
  - `isRetryable` 不变
- `coze-workflows.ts` `evaluateText`：
  - `maxTokens: 8000`、`deepThinking: false`、`temperature: 0.2`
  - schema 字段缩减：保留 decision/scores/coveredPoints/missingPoints/incorrectPoints/ambiguousPhrases/safetyAlerts/questions/studentFeedback/teacherSummary/reasoningReview/standardAnswer/improvedAnswer/knowledgeExplanation/nextAction/detailedIssues，移除非必要字段（`schemaVersion` 保留）
- `coze-workflows.ts` `generateReport`：
  - `maxTokens: 14000`、`deepThinking: false`、`temperature: 0.25`
  - 保持 markdown + sections 两部分
- 同步在 prompt 里追加"控制输出长度在指定 token 范围内"约束

### 模块 3：前端评阅按钮文案与状态（`src/components/student/experiment-writer.tsx`）

- 父组件（`step-workstation.tsx`）新增 `phase: 'idle' | 'preparing' | 'evaluating' | 'error'`
- busy 时按钮文字：`phase === 'preparing' ? "正在提交…" : "正在评阅，请保留页面…"`
- 错误态显示重试按钮（点击清错并允许再次提交）

### 模块 4：错误信息友好化（`src/lib/client-request.ts`）

- 新增识别：
  - `SyntaxError` + `JSON` → "评阅服务返回异常，请稍后重试"
  - `HTTP 502/503/504` 关键词 → "服务暂时不可达，请稍后重试"
- 保留现有网络错误识别

## 是否有原型设计

否（本次为性能与错误处理修复，不涉及 UI 结构改动；按钮文案与错误样式属微调，不触发原型设计流程）。

## 实施步骤

1. **客户端 API 健壮性**：在 `src/components/student/step-workstation.tsx` 新增 `safeApi` 替换 `api`，处理非 JSON 响应与 HTTP 5xx；同步在 `src/lib/client-request.ts` 扩展 `clientErrorMessage` 识别 SyntaxError/JSON 错误。涉及 `step-workstation.tsx`、`client-request.ts`。
2. **AI 网关超时与重试调参**：在 `src/lib/ai-gateway.ts` 调整 `timeoutMs` 默认 45_000、`retryCount` 默认 1；在 `src/lib/coze-workflows.ts` 调整 `evaluateText`（maxTokens 8000、deepThinking false）与 `generateReport`（maxTokens 14000、deepThinking false）。涉及 `ai-gateway.ts`、`coze-workflows.ts`。
3. **前端评阅按钮文案与状态机**：在 `step-workstation.tsx` 新增 `phase` 状态，传给 `experiment-writer.tsx` 的 `busy`/按钮文案；新增重试入口。涉及 `step-workstation.tsx`、`experiment-writer.tsx`。
4. **回归验证**：手动触发一次 step 评阅，验证 30s 内返回 + 错误态文案正确；在 `pnpm ts-check` / `pnpm lint` 跑过。

## 页面规格

无（本次仅修改按钮文案与错误态样式，不改变页面布局或导航结构）。

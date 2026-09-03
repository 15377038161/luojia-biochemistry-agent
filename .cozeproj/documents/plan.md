# AI 点评系统全面优化方案

## 概述

针对当前 AI 点评系统的四大核心问题（评测逻辑失准、答案解析不足、报告过于简单、缺知识点检验），进行全面重构。涉及 prompt 工程、数据模型扩展、UI 重设计、新增独立检验流程。平台：web（Next.js 16 + React 19 + TypeScript 5）。

## 技术方案

| 维度 | 选择 | 理由 |
|------|------|------|
| 评测 Prompt | 重写 `coze-workflows.ts` 中 TEXT_SCHEMA + 评测指令 | 现有 schema 已有 detailedIssues / reasoningReview / knowledgeExplanation 字段，补强指令避免虚判 |
| 答案解析 | 扩展 `standardAnswer` / `improvedAnswer` / `knowledgeExplanation` 生成指令 | 三字段已存在，现在生成内容过简，需强制详尽度要求 |
| 报告升级 | 在 `study-report.tsx` 增加失分点、短板、雷达图（已有）、提升建议展示 | 雷达图已实现，只需补充文字分析展示 |
| 知识点检验 | 新建 `/student/quiz` 路由 + `quiz-session` 表 + AI 出题 workflow + 单页答题 UI | 当前无检验功能，需从零建立题库生成、答题与批改闭环 |

## 功能模块

### 模块 1：评测逻辑优化

**职责**：让 AI 点评真正聚焦知识点掌握、实验细节理解、数据解读清晰度，避免误判。

**核心改动**：
- 重写 `src/lib/coze-workflows.ts` 中的 `evaluateText` 函数的 system prompt，强调：
  - 必须逐条对照 rubric 要点检查学生答案是否覆盖
  - coveredPoints 必须引用学生原文作证据，无证据不得标记为"已掌握"
  - missingPoints / incorrectPoints / ambiguousPhrases 三类必须准确分类，不得因"看起来懂"就跳过
  - detailedIssues 数组必须为每个缺失/错误/模糊项生成一条记录，含 dimension / evidence / impact / action / check
- 在 prompt 中加入反例与正例对比（"❌ 学生写'跑个胶看看'→不能判定为操作描述清晰；✅ 学生写'12% SDS-PAGE，恒压 120V 电泳 90 分钟'→操作描述清晰"）
- 加入"三必查"清单：知识点是否说清原理、实验步骤是否可复现、数据解读是否有推理链

**数据字段**：无需新增字段，充分利用现有 `evaluations.result` JSONB 中的 detailedIssues / reasoningReview / coveredPoints / missingPoints

### 模块 2：参考答案与原理解析升级

**职责**：所有环节的 standardAnswer / improvedAnswer / knowledgeExplanation 必须详尽到可作教材。

**核心改动**：
- 在 `evaluateText` prompt 中加入生成指令：
  - `standardAnswer`：必须包含本步所有 rubric 要点的完整答案，按"为什么这么做→怎么做→怎么判断做好了"三段展开，包含具体参数、原理依据、注意事项
  - `improvedAnswer`：在学生原答案基础上，保留学生表达风格，只补齐缺失、纠正错误、消除模糊，标注修改处（如"【补充】超声功率 200W，工作 3s / 间隔 5s，循环 10 次"）
  - `knowledgeExplanation`：拆解本步核心知识点的底层逻辑（如"SDS-PAGE 为什么用 SDS？→统一负电荷→消除电荷差异→只按分子量分离"），关联前置知识（如"前置：蛋白质一级结构决定分子量"）与后续知识（如"后续：Western Blot 依赖 SDS-PAGE 分离结果"），常见误区（如"❌ 误以为 SDS 本身有还原性"），2-5 句展开

**数据字段**：现有字段足够，只改生成内容

### 模块 3：学习报告功能改版

**职责**：从"极简单题得分"升级为"完整学习诊断报告"，独立页面展示。

**核心改动**：
- **数据层**（`src/lib/services/grading.ts` 的 `buildLearningReportContent`）：
  - 补充失分点解析：从所有 evaluations.result.detailedIssues 聚合，按 dimension 分组，每组列出 top 3 高频问题 + 对应步骤 + evidence
  - 补充知识点短板：从所有 evaluations.result.missingPoints 聚合，列出重复缺失的知识点（如"缺失超声参数" 出现 3 次）
  - 补充提升建议：针对每个维度的最低分项，生成 1-2 条可执行建议（如"操作描述维度：下次提交前检查每个步骤是否包含参数、时间、温度"）
- **UI 层**（`src/components/student/study-report.tsx`）：
  - 五维雷达图已有，保留
  - 在雷达图下方新增三个 section：
    - "失分点解析"：按维度分组，每组列出问题 + 步骤 + 证据摘录 + 影响
    - "知识点掌握短板"：列出重复缺失的知识点 + 出现次数 + 对应步骤
    - "针对性提升建议"：每个维度一条建议，含具体检查点
  - 报告已是独立页面（`/student/report`），无需额外调整路由

**数据字段**：`learning_reports.content` JSONB 扩展 `detailedIssues` / `knowledgeGaps` / `improvementSuggestions` 三个键

### 模块 4：知识点检验页面重构

**职责**：全新建立"知识点检验"闭环——AI 出题 → 单页答题 → 统一批改 → 答案解析。

**核心改动**：
- **数据模型**（新建迁移 `supabase/migrations/YYYYMMDD_quiz_system.sql`）：
  ```sql
  CREATE TABLE quiz_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    step_no int NOT NULL,
    questions jsonb NOT NULL, -- [{id, question, answer, rubric}]
    answers jsonb, -- {question_id: user_answer}
    results jsonb, -- {question_id: {correct, feedback, explanation}}
    completed_at timestamptz,
    created_at timestamptz DEFAULT now()
  );
  CREATE INDEX idx_quiz_sessions_user_step ON quiz_sessions(user_id, step_no);
  ```
- **AI 出题 workflow**（`src/lib/coze-workflows.ts` 新增 `generateQuiz`）：
  - 输入：步骤号 + 该步核心知识点（从 experimentSteps[stepNo].keyPoints 提取）
  - 输出：3-5 道题，每道题含 question / correctAnswer / rubric（评分标准）
  - Prompt 要求：题目覆盖本步核心概念、实验细节、数据解读，避免死记硬背，每题附详细解析（原理 + 常见误区）
  - 题目池：每次生成不同题目（通过 temperature=0.8 + 种子随机化），存入 quiz_sessions.questions
- **答题 UI**（`src/app/student/quiz/[sessionId]/page.tsx` + `src/components/student/quiz-page.tsx`）：
  - 单页只展示一道题（题号 + 题目 + 输入框）
  - 底部："提交本题" 按钮 → 提交后跳转下一题（不显示答案）
  - 最后一题提交后 → "查看答案与解析" 按钮 → 跳转答案页
- **批改与解析**（`src/app/api/student/quiz/submit/route.ts`）：
  - 收集所有 answers → 逐题对照 correctAnswer 评分 → 生成 results
  - 答案页展示：每题一行（题目 + 用户答案 + 正确答案 + 详细解析 + 得分）

**数据字段**：新表 `quiz_sessions`（含 questions / answers / results 三个 JSONB 字段）

## 是否有原型设计

否（纯功能增强，UI 沿用现有设计系统）

## 实施步骤

1. **评测 Prompt 重写**（coze-workflows.ts evaluateText 指令 + schema 注释强化）
2. **答案解析升级**（同一文件，补充 standardAnswer / improvedAnswer / knowledgeExplanation 生成指令）
3. **报告数据层扩展**（grading.ts buildLearningReportContent 聚合 detailedIssues / gaps / suggestions）
4. **报告 UI 改版**（study-report.tsx 新增三个 section）
5. **知识点检验数据模型**（新建迁移创建 quiz_sessions 表）
6. **AI 出题 workflow**（coze-workflows.ts 新增 generateQuiz 函数）
7. **答题 UI 与批改 API**（新建 /student/quiz 路由 + quiz-page 组件 + submit API）
8. **集成测试与验证**（预览环境走完整流程：提交步骤 → 看点评详细度 → 生成报告 → 做知识点检验）

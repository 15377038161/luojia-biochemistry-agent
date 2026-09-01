import { randomUUID } from 'node:crypto';
import { LLMClient } from 'coze-coding-dev-sdk';
import type { ContentPart, Message } from 'coze-coding-dev-sdk';
import { assertEvaluation } from '@/domain/evaluation';
import { getExperimentStep } from '@/domain/experiment';
import type { ExperimentStep, TextEvaluation } from '@/domain/agent';

export interface WorkflowResult<T> {
  data: T;
  runId?: string;
}

const MODEL_PRO = 'doubao-seed-2-0-pro-260215';
const MODEL_LITE = 'doubao-seed-2-0-lite-260215';

const SCORING_RULES = `五维评分上限：knowledge 20 / operation 30 / decision 20 / troubleshooting 15 / analysis 15（总分 100）。
判定规则：总分 >= 80 且无关键要点缺失 → decision = "pass"；存在缺失或错误但可修改 → "revise"；信息不足以判断 → "teacher_review"。`;

const TEXT_SCHEMA = `{
  "schemaVersion": "TextEvaluation.v2",
  "decision": "pass | revise | teacher_review",
  "confidence": 0.0-1.0,
  "coveredPoints": [{ "rubricId": "要点id", "label": "要点名称", "quote": "学生原文中的证据摘录" }],
  "missingPoints": [{ "rubricId": "要点id", "label": "要点名称", "guidance": "引导性提示（不透露完整答案）" }],
  "incorrectPoints": [{ "rubricId": "要点id", "label": "要点名称", "guidance": "指出错误并给出修正方向" }],
  "ambiguousPhrases": [{ "rubricId": "要点id", "label": "模糊表述", "guidance": "说明为何模糊、如何表述更严谨" }],
  "safetyAlerts": [{ "rubricId": "要点id", "label": "安全隐患", "guidance": "安全提醒" }],
  "questions": ["向学生提出的 1-3 个引导性问题"],
  "studentFeedback": "面向学生的结构化反馈。按表现、证据、影响、下一步写 2-4 个短段，不提供完整标准答案。",
  "teacherSummary": "面向教师的评阅摘要：主要问题类型、对应要点与是否需要人工复核。",
  "scores": { "knowledge": 0-20, "operation": 0-30, "decision": 0-20, "troubleshooting": 0-15, "analysis": 0-15 },
  "requiresTeacherReview": true | false,
  "knowledgeChunkIds": ["涉及的知识点id，无则空数组"],
  "detailedIssues": [{
    "dimension": "knowledge | operation | decision | troubleshooting | analysis",
    "kind": "missing | incorrect | ambiguous | safety",
    "title": "具体问题",
    "evidence": { "stepId": 1, "quote": "学生原文；没有可引用内容时留空", "attemptNo": 1 },
    "scenario": "问题出现在哪个答题或学习场景",
    "impact": "该问题会影响什么判断或后续步骤",
    "causeBoundary": "只能由本次证据确认的原因边界，不推测性格或习惯",
    "action": "学生下一次可直接执行的修订动作",
    "check": "下一次提交时可核对的完成标准"
  }]
}`;

const VISION_SCHEMA = `{
  "summary": "照片内容与实验目标匹配度的一句话概述",
  "studentFeedback": "面向学生的反馈（描述观察结果并给出改进建议，不说教）",
  "checks": { "每个检查项id": { "pass": true | false, "label": "检查项名称", "comment": "判定依据" } },
  "confidence": 0.0-1.0,
  "requiresTeacherReview": true | false
}`;

const REPORT_SCHEMA = `{
  "schemaVersion": "StudyReport.v2",
  "markdown": "完整的 Markdown 格式文字实验学习报告",
  "sections": {
    "schemaVersion": "StudyReport.v2",
    "dataBasis": ["本报告使用了哪些步骤、版本、Gate和评阅记录"],
    "dimensionDefinitions": [{ "dimension": "知识理解", "max": 20, "definition": "维度定义", "scoringBasis": "评分依据" }],
    "stepEvidence": [{ "stepNo": 1, "evidence": ["学生原文或评阅证据"] }],
    "strengths": ["有证据支持的优势"],
    "issues": [{ "category": "问题分类", "evidence": "具体场景或原文", "impact": "问题影响" }],
    "causeBoundaries": ["可确认原因与不能推断的边界"],
    "actionPlan": [{ "action": "可执行动作", "appliesTo": "适用步骤", "check": "检查标准" }],
    "gradeStatus": "成绩状态",
    "teacherReviewStatus": "教师复核状态"
  }
}`;

interface VisionCheck {
  id: string;
  label: string;
  prompt: string;
}

function fixtureEnabled() {
  return process.env.ENABLE_AI_FIXTURE === 'true' && process.env.NODE_ENV !== 'production';
}

async function invokeLlm(messages: Message[], config?: { model?: string; temperature?: number }) {
  const client = new LLMClient();
  const response = await client.invoke(messages, {
    model: config?.model ?? MODEL_PRO,
    temperature: config?.temperature ?? 0.2,
    thinking: 'disabled',
    caching: 'disabled',
  });
  return response.content;
}

function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI 输出中未找到 JSON 内容');
  return JSON.parse(text.slice(start, end + 1));
}

function stepBrief(step: ExperimentStep) {
  return JSON.stringify({ step_id: step.id, title: step.title, context: step.context, goal: step.goal });
}

function fixtureEvaluation(step: ExperimentStep, answer: string): TextEvaluation {
  const lengthFactor = Math.min(1, answer.trim().length / 420);
  const coveredCount = Math.max(1, Math.min(5, Math.floor(answer.trim().length / 90) + 1));
  const covered = step.keyPoints.slice(0, coveredCount);
  const missing = step.keyPoints.slice(coveredCount);
  const max = { knowledge: 20, operation: 30, decision: 20, troubleshooting: 15, analysis: 15 };
  const scores = Object.fromEntries(Object.entries(max).map(([key, value]) => [key, Math.round(value * lengthFactor)])) as unknown as TextEvaluation['scores'];
  const total = Object.values(scores).reduce((sum, item) => sum + item, 0);
  return {
    schemaVersion: 'TextEvaluation.v2',
    decision: total >= 80 && missing.length === 0 ? 'pass' : 'revise',
    confidence: 0.72,
    coveredPoints: covered.map((item) => ({ rubricId: item.id, label: item.label, quote: '演示评阅：已检测到相关说明' })),
    missingPoints: missing.map((item) => ({ rubricId: item.id, label: item.label, guidance: item.hints[0] })),
    incorrectPoints: [],
    ambiguousPhrases: [],
    safetyAlerts: [],
    questions: missing.slice(0, 2).map((item) => item.hints[Math.min(2, Math.max(0, 3 - missing.length))]),
    studentFeedback: missing.length
      ? `本次描述已覆盖${covered.map((item) => item.label).join('、')}。但在“${missing[0].label}”这一学习场景中，文字没有交代关键依据，因此读者无法复现你的判断路径。请先补写：${missing[0].hints[0]}；再说明这会如何影响下一步选择。`
      : '本次描述已逐项覆盖本步要点，操作顺序、判断依据和结果解释能够相互对应。下一步请继续保留“依据—判断—后续动作”的表达方式。',
    teacherSummary: `演示评阅共覆盖${covered.length}/5个维度。`,
    scores,
    requiresTeacherReview: false,
    knowledgeChunkIds: step.keyPoints.map((item) => item.id),
    detailedIssues: missing.map((item) => ({
      dimension: item.dimension,
      kind: 'missing',
      title: item.label,
      evidence: { stepId: step.id, quote: '', attemptNo: 1 },
      scenario: `本次第${step.id}步提交没有交代“${item.label}”所需的判断依据。`,
      impact: '教师或同伴无法根据文字复核你的实验决策，后续步骤也缺少可追溯前提。',
      causeBoundary: '只能确认本次文字提交缺少该信息，不能据此推断你的日常学习习惯。',
      action: item.hints[0],
      check: `修订后应能从原文中直接找到“${item.label}”对应的条件、理由与后续影响。`,
    })),
  };
}

export async function evaluateText(step: ExperimentStep, answer: string, attemptNo: number): Promise<WorkflowResult<TextEvaluation>> {
  if (fixtureEnabled()) return { data: fixtureEvaluation(step, answer), runId: 'fixture' };
  const system = [
    '你是生物化学文字实验的评阅专家，负责对学生提交的实验方案与步骤描述进行证据化评阅。学生没有执行真实实验。',
    SCORING_RULES,
    '评阅要求：',
    '1. 逐条对照实验要点的 keywords 与 hints，将学生表述归类为 covered / missing / incorrect / ambiguous。',
    '2. coveredPoints.quote 必须摘录学生原文，不得改写。',
    '3. 学生出现危险操作（如错误试剂、危险加热方式）时必须写入 safetyAlerts。',
    '4. 每一个 missing / incorrect / ambiguous 项都必须对应具体学习场景：引用学生原话，或明确写“本次提交未交代……”。不能写“描述不够完整”“建议加强”等空泛结论。',
    '5. studentFeedback 必须按“表现—证据—影响—下一步”组织 2-4 段：说明学生写了什么或没写什么、会影响哪项判断、下一次应补写或核对什么；不得给出完整标准答案。',
    '6. detailedIssues 必须逐项对应问题维度、学生证据、学习场景、影响、原因边界、可执行动作和检查标准。没有证据就让 quote 为空并明确写“本次提交未交代”，禁止推测学习态度、性格或家庭表现。',
    `7. 只输出一个 JSON 对象，不要输出任何其他文字。字段结构：${TEXT_SCHEMA}`,
  ].join('\n');
  const user = [
    `实验步骤信息：${stepBrief(step)}`,
    `评分要点（含维度与提示）：${JSON.stringify(step.keyPoints)}`,
    `确定性关卡（出现即判 revise）：${JSON.stringify(step.gates)}`,
    `第 ${attemptNo} 次提交`,
    `学生提交内容：${answer}`,
  ].join('\n');
  const content = await invokeLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: MODEL_PRO, temperature: 0.2 },
  );
  return { data: assertEvaluation(extractJson(content)), runId: randomUUID() };
}

export type StudentQuestionMode = 'task' | 'review';

export async function answerStudentQuestion(step: ExperimentStep, question: string, mode: StudentQuestionMode = 'task'): Promise<WorkflowResult<string>> {
  if (fixtureEnabled()) {
    return { data: mode === 'review'
      ? `可以结合本步报告继续看。先定位“${step.keyPoints[0].label}”对应的原文证据，再对照参考作答框架检查条件、理由和判断是否齐全。`
      : `这道问题和“${step.shortTitle}”有关。先想一想：${step.keyPoints[0].hints[0]} 我可以根据你的回答继续提示。`, runId: 'fixture' };
  }
  const system = [
    mode === 'review'
      ? '你是生物化学文字实验的复盘助教。学生已经提交本步答案，可以解释课程评分要点、点评原因与修订方法，但不能虚构实验结果。'
      : '你是生物化学文字实验的引导助教，用苏格拉底式提问引导学生自行发现答案。学生还未进入独立作答，不是在执行真实实验。',
    '要求：',
    mode === 'review'
      ? '1. 结合当前步骤的课程提示解释“为什么这样评”和“应该怎样修改”；可以说明参考作答框架，但要提醒并非唯一表述。'
      : '1. 不直接给出完整答案；可以指出思考方向、给出一部分原理或反问。',
    '2. 回复控制在 200 字以内，使用简体中文。',
    '3. 若学生问题与实验无关，礼貌地把话题引回当前实验步骤。',
  ].join('\n');
  const user = [`当前实验步骤：${stepBrief(step)}`, `课程评分要点：${JSON.stringify(step.keyPoints)}`, `学生提问：${question}`].join('\n');
  const content = await invokeLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: MODEL_LITE, temperature: 0.7 },
  );
  return { data: content.trim(), runId: randomUUID() };
}

export async function evaluateVision(parameters: Record<string, unknown>): Promise<WorkflowResult<Record<string, unknown>>> {
  if (fixtureEnabled()) {
    return {
      data: {
        summary: '演示照片评阅：已收到图像，等待接入真实视觉模型。',
        studentFeedback: '照片已提交（演示模式）。请确认仪器与试剂摆放清晰可见。',
        checks: Object.fromEntries(((parameters.checks as VisionCheck[] | undefined) ?? []).map((check) => [check.id, { pass: true, label: check.label, comment: '演示判定' }])),
        confidence: 0.6,
        requiresTeacherReview: true,
      },
      runId: 'fixture',
    };
  }
  const imageUrl = parameters.image_url;
  const stepId = parameters.step_id;
  if (typeof imageUrl !== 'string' || !imageUrl) throw new Error('PARAM_INVALID: image_url 缺失');
  if (typeof stepId !== 'number') throw new Error('PARAM_INVALID: step_id 缺失');
  const step = getExperimentStep(stepId);
  const checks = (Array.isArray(parameters.checks) ? parameters.checks : []) as VisionCheck[];
  const system = [
    '你是生物化学实验的照片评阅专家，根据实验步骤目标与检查清单评估学生上传的实验照片。',
    '评阅要求：',
    '1. 只依据照片中可见的证据下结论，看不到的不要臆测。',
    '2. checks 对象必须覆盖输入检查清单中的每一个 id，逐项给出 pass / label / comment。',
    '3. 照片模糊、光线不足或与步骤无关时降低 confidence 并将 requiresTeacherReview 置为 true。',
    `4. 只输出一个 JSON 对象，不要输出任何其他文字。字段结构：${VISION_SCHEMA}`,
  ].join('\n');
  const userText = [`实验步骤信息：${stepBrief(step)}`, `检查清单：${JSON.stringify(checks)}`].join('\n');
  const contentParts: ContentPart[] = [
    { type: 'image_url', image_url: { url: imageUrl } },
    { type: 'text', text: userText },
  ];
  const content = await invokeLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: contentParts },
    ],
    { model: MODEL_PRO, temperature: 0.2 },
  );
  return { data: extractJson(content) as Record<string, unknown>, runId: randomUUID() };
}

export async function generateReport(parameters: Record<string, unknown>): Promise<WorkflowResult<Record<string, unknown>>> {
  if (fixtureEnabled()) {
    const steps = (parameters.steps as Array<{ step_no: number; final_summary?: string }> | undefined) || [];
    return {
      data: {
        schemaVersion: 'StudyReport.v2',
        markdown: `## 学习结论\n已完成 ${steps.filter((item) => item.final_summary).length}/8 个文字推演步骤。当前报告只分析已提交的文字与评阅记录。\n\n## 优势与证据\n能按步骤推进，并在已通过的 Gate 中形成了可复核的文字说明。\n\n## 优先改进\n针对待修订步骤，按“依据—判断—下一步动作”补全关键参数和结果解释；每次只修订一个具体要点，再重新提交。\n\n## 下次学习动作\n先对照本步任务逐条自检：是否写明条件、理由、观察依据和后续判断。`,
        sections: {
          schemaVersion: 'StudyReport.v2',
          dataBasis: [`已读取 ${steps.length} 个步骤状态，仅分析已提交的文字与评阅记录。`],
          dimensionDefinitions: [
            { dimension: '知识理解', max: 20, definition: '原理、术语与条件关系', scoringBasis: '准确性与完整性' },
            { dimension: '操作描述', max: 30, definition: '文字方案、顺序与关键条件', scoringBasis: '步骤与记录要素完整度' },
            { dimension: '科学决策', max: 20, definition: '选择与依据的对应关系', scoringBasis: '理由是否支持选择' },
            { dimension: '问题解决', max: 15, definition: '异常识别与处理方向', scoringBasis: '识别与应对逻辑' },
            { dimension: '结果分析与判断', max: 15, definition: '由案例证据形成判断', scoringBasis: '观察、判断与动作链条' },
          ],
          stepEvidence: [], strengths: ['已通过的 Gate 中形成了可复核的文字说明。'],
          issues: [], causeBoundaries: ['数据不足的维度不作负面推断，也不推测学习习惯。'],
          actionPlan: [{ action: '按依据、判断、下一步动作补全待修订步骤', appliesTo: '待修订 Gate', check: '三项内容一一对应且能由原文核对' }],
          gradeStatus: '尚未认定', teacherReviewStatus: '暂无教师复核',
        },
      },
      runId: 'fixture',
    };
  }
  const system = [
    '你是生物化学文字实验学习分析专家，根据学生的各步骤文字推演和评阅记录生成结构化学习报告。',
    '要求：',
    '1. markdown 使用二级/三级标题组织：学习范围与数据依据、能力解读、关键问题（每项包含学习场景/证据/影响）、可能成因、两周内可执行的改进行动、总评。',
    '2. 基于给定数据客观陈述，不得虚构学生执行过实验，不得补写未提供的参数、现象、数据或结论。',
    '3. 总评中体现五维得分的优势与短板。每个问题必须引用输入中的步骤、Gate、原话摘录或评阅项；数据不足时明确写“暂无足够证据”，不得推测学习习惯或真实实验表现。',
    '4. 改进建议必须可执行，包含动作、适用步骤和自检标准，避免“多练习”“加强理解”等空泛表述。',
    '5. 这是学习情况报告，不得写成正式实验报告。',
    `6. 只输出一个 JSON 对象，不要输出任何其他文字。字段结构：${REPORT_SCHEMA}`,
  ].join('\n');
  const content = await invokeLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: `学生报告数据：${JSON.stringify(parameters)}` },
    ],
    { model: MODEL_PRO, temperature: 0.4 },
  );
  return { data: extractJson(content) as Record<string, unknown>, runId: randomUUID() };
}

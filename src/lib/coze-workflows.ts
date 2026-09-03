import { randomUUID } from 'node:crypto';
import { LLMClient } from 'coze-coding-dev-sdk';
import type { ContentPart, Message } from 'coze-coding-dev-sdk';
import { assertEvaluation } from '@/domain/evaluation';
import { getExperimentStep } from '@/domain/experiment';
import type { ExperimentStep, TextEvaluation } from '@/domain/agent';
import { AiValidationError } from '@/lib/errors';

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
  }],
  "strengths": ["学生本次作答写得好的 1-3 个要点（写不出可空数组）"],
  "reasoningReview": "对学生推理路径的复盘评价：思路从哪一步开始偏或成立，依据是否充分",
  "standardAnswer": "完整参考答案。必须包含：① 本步所有关键知识点的底层原理（如SDS作用机制、分子筛原理、pH影响蛋白稳定性的化学键基础）；② 实验步骤的设计目的、操作顺序、关键参数（温度/浓度/时间）及注意事项；③ 实验数据的推导过程（从观察到结论的逻辑链、异常识别与误差分析）；④ 关联前置与后续知识点（如本步为后续定量分析奠定了什么基础）；⑤ 常见误区与纠正方法。答案详尽到可作教材，禁止只列操作流程或泛泛而谈。",
  "improvedAnswer": "在学生原作答基础上的改写推荐答案。要求：① 保留学生表达风格与已写对的部分；② 对 missing / incorrect / ambiguous 项逐一补齐或纠正；③ 每处补齐必须注明"（补充：原理是……）"或"（纠正：应为……，因为……）"；④ 补齐内容必须详尽到与 standardAnswer 同等水平（含原理拆解、参数完整、关联前后知识点）；⑤ 若学生本次提交为空或严重偏离，improvedAnswer 可退化为 standardAnswer 的精简版。",
  "knowledgeExplanation": "本步涉及核心知识点的详细讲解。必须包含：① 核心概念的底层原理拆解（如"SDS为阴离子表面活性剂，带负电荷，与蛋白疏水区结合后统一负电性，使电荷/质量比近似相等，电泳迁移率仅取决于分子量"）；② 关键参数的取值依据与影响（如"pH 8.8 确保Tris-HCl缓冲体系稳定且蛋白不聚集"）；③ 关联前置知识（如"还原剂DTT打开二硫键是因为其巯基(-SH)可与蛋白二硫键(-S-S-)发生硫醇-二硫键交换反应"）与后续影响（如"分离后的条带可用于Western Blot或质谱鉴定"）；④ 常见误区（如"误以为任何去垢剂都能替代SDS——实际上非离子去垢剂不带电，无法统一电荷"）。讲解详尽到学生可直接用于复习备考，禁止泛泛而谈或只重复操作步骤。",
  "nextAction": "学生下一步最应做的一件事（明确、可执行）"
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
  if (start === -1 || end <= start) throw new AiValidationError('AI 输出中未找到 JSON 内容');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiValidationError('AI 输出的 JSON 无法解析');
  }
}

function stepBrief(step: ExperimentStep) {
  return JSON.stringify({ step_id: step.id, title: step.title, context: step.context, goal: step.goal });
}

export function fixtureEvaluation(step: ExperimentStep, answer: string): TextEvaluation {
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
    strengths: covered.map((item) => item.label),
    reasoningReview: missing.length ? '演示评阅：本次推理在部分要点上缺少依据支撑，需要补齐判断链条。' : '演示评阅：推理链条完整，依据与结论一一对应。',
    standardAnswer: step.keyPoints.map((item) => `${item.label}：${item.hints.join('；')}`).join('；'),
    improvedAnswer: answer.trim() ? `${answer.trim()}\n（补充）${missing.map((item) => item.label).join('、')}：按课程要点补齐依据与影响。` : '',
    knowledgeExplanation: step.keyPoints.map((item) => item.hints[0]).join(' '),
    nextAction: missing.length ? `优先补写“${missing[0].label}”的判断依据。` : '保持当前表达结构，继续下一步。',
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
    '核心评测维度（每个维度必须充分验证）：',
    '1. 知识点掌握程度：学生是否准确理解并运用本步所需的生化原理、术语、条件关系与参数范围？',
    '2. 实验步骤细节理解度：学生是否清楚各步骤的设计目的、操作顺序、关键条件、注意事项与误差来源？',
    '3. 实验数据解读清晰度：学生能否从案例数据推导出正确结论、识别异常、建立因果关系并推测后续影响？',
    '评阅要求：',
    '1. 逐条对照实验要点的 keywords 与 hints，将学生表述归类为 covered / missing / incorrect / ambiguous。',
    '2. coveredPoints.quote 必须摘录学生原文，不得改写。',
    '3. 学生出现危险操作（如错误试剂、危险加热方式）时必须写入 safetyAlerts。',
    '4. 每一个 missing / incorrect / ambiguous 项都必须对应具体学习场景：引用学生原话，或明确写"本次提交未交代……"。不能写"描述不够完整""建议加强"等空泛结论。',
    '5. studentFeedback 必须按"表现—证据—影响—下一步"组织 2-4 段：说明学生写了什么或没写什么、会影响哪项判断、下一次应补写或核对什么；不得给出完整标准答案。',
    '6. detailedIssues 必须逐项对应问题维度、学生证据、学习场景、影响、原因边界、可执行动作和检查标准。没有证据就让 quote 为空并明确写"本次提交未交代"，禁止推测学习态度、性格或家庭表现。',
    '7. strengths/reasoningReview/standardAnswer/improvedAnswer/knowledgeExplanation/nextAction 六个字段必须基于本步课程要点与Gate填写：standardAnswer 是完整参考答案，improvedAnswer 在学生原作答上补齐缺失并纠正错误，knowledgeExplanation 讲解本步核心知识点，禁止编造课程外实验结果。',
    '**三必查清单（任一项未通过则必须归为 missing / incorrect / ambiguous，不得虚判为 covered）**：',
    '  a. 知识点必查：学生是否写出了本步核心原理的关键术语与因果关系（如"SDS统一负电荷"、"分子筛效应"、"pH影响蛋白稳定性"），还是只写了操作流程？',
    '  b. 实验细节必查：学生是否交代了关键参数（温度、浓度、时间）、操作顺序与注意事项，还是仅列出大致步骤？',
    '  c. 数据解读必查：学生能否从给定的案例数据或观察结果推导出正确结论、识别异常并推测后续影响，还是只重复描述了数据本身？',
    '**反例参照（这些是判定 incorrect / ambiguous 的典型信号）**：',
    '  - 学生写"加入试剂A"但未说明浓度、加入顺序、等待时长 → 实验细节缺失',
    '  - 学生写"通过电泳分离蛋白"但未提及SDS作用、凝胶浓度或分子筛原理 → 知识点浮于表面',
    '  - 学生看到"泳道2比泳道1条带更亮"就结论"表达量高"但未解释亮度与蛋白量关系、未考虑上样量差异 → 数据解读跳步',
    '  - 学生写"小心操作"但未说明具体风险点或防范措施 → 空泛表述',
    `8. 只输出一个 JSON 对象，不要输出任何其他文字。字段结构：${TEXT_SCHEMA}`,
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

export interface QuizQuestion {
  question_id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  explanation: string;
}

/**
 * 根据步骤主题生成知识点检验题目
 * @param stepNo 步骤编号
 * @param count 题目数量（默认5题）
 * @returns 题目数组
 */
export async function generateQuizQuestions(
  stepNo: number,
  count: number = 5,
): Promise<WorkflowResult<QuizQuestion[]>> {
  const step = getExperimentStep(stepNo);
  if (!step) {
    throw new Error(`步骤 ${stepNo} 不存在`);
  }

  const QUIZ_SCHEMA = `[
  {
    "question_id": "uuid",
    "question_text": "题干（单选题，基于步骤核心主题与原理）",
    "options": [
      { "id": "A", "text": "选项内容" },
      { "id": "B", "text": "选项内容" },
      { "id": "C", "text": "选项内容" },
      { "id": "D", "text": "选项内容" }
    ],
    "correct_option_id": "正确选项id（A/B/C/D）",
    "explanation": "答案解析（详细讲解正确答案的原理、错误选项的误区、关联知识点）"
  }
]`;

  const system = [
    `你是生物化学教学专家，负责为步骤 ${stepNo}「${step.goal}」生成知识点检验题目。`,
    '出题要求：',
    `1. 生成 ${count} 道单选题，每题 4 个选项（A/B/C/D），正确答案唯一。`,
    '2. 题目必须覆盖本步骤的核心知识点（原理、实验细节、数据解读）三个维度，每个维度至少出 1 题。',
    '3. 题干清晰具体，避免模棱两可；干扰项设计合理，基于常见误区或概念混淆，不得明显错误到一眼排除。',
    '4. explanation 必须详尽：解释正确答案的原理（含底层机制、参数依据）、每个错误选项的误区、关联前后知识点。',
    '5. 每次调用必须生成不同的题目（变换题干角度、参数、场景），确保题目池随机性，杜绝重复。',
    '6. 题目难度适中：既要考查理解深度，也要让认真学习的学生有信心答对。',
    `7. 只输出一个 JSON 数组，不要输出任何其他文字。数组结构：${QUIZ_SCHEMA}`,
  ].join('\n');

  const userPrompt = [
    `步骤主题：${step.goal}`,
    `核心原理：${step.principle || '（请根据步骤主题推导）'}`,
    `任务情境：${step.context}`,
    `理论概要：${step.keyPoints.map((kp) => `${kp.dimension}：${kp.hints.join('；')}`).join('\n')}`,
    `请生成 ${count} 道符合上述要求的题目。`,
  ].join('\n\n');

  const content = await invokeLlm(
    [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    { model: MODEL_PRO, temperature: 0.8 }, // 高温度确保随机性
  );

  const questions = extractJson(content) as QuizQuestion[];
  if (!Array.isArray(questions) || questions.length !== count) {
    throw new AiValidationError(`AI 返回的题目数量或结构不符合预期，期望 ${count} 题，实际 ${questions?.length ?? 'undefined'}`);
  }

  // 为每题分配 uuid（如果 AI 未生成）
  questions.forEach((q) => {
    if (!q.question_id || q.question_id === 'uuid') {
      q.question_id = randomUUID();
    }
  });

  return { data: questions, runId: randomUUID() };
}

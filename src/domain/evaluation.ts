import type { DetailedFeedbackIssue, DimensionScores, TextEvaluation } from '@/domain/agent';
import { AiValidationError } from '@/lib/errors';
import { getExperimentStep } from '@/domain/experiment';

const DIMENSION_MAX: DimensionScores = {
  knowledge: 20,
  operation: 30,
  decision: 20,
  troubleshooting: 15,
  analysis: 15,
};

interface RequiredEvidenceCheck {
  id: string;
  label: string;
  dimension: keyof DimensionScores;
  patterns: RegExp[];
  minimumMatches: number;
  guidance: string;
}

const REQUIRED_EVIDENCE: Record<number, RequiredEvidenceCheck[]> = {
  1: [
    { id: 's1-required-principle', label: '序列来源与重组原理', dimension: 'knowledge', patterns: [/NCBI|GenBank|登录号|编码序列/i, /同源(臂|重组)/, /pET-?28/i], minimumMatches: 3, guidance: '说明目标基因编码序列来源、pET-28a载体和同源臂为何能够完成定向重组。' },
    { id: 's1-required-parameters', label: '引物关键参数', dimension: 'operation', patterns: [/\b(18|19|20|21|22|23|24|25)\s*(bp|nt)/i, /GC.{0,8}(40|45|50|55|60)\s*%/i, /Tm.{0,8}(55|56|57|58|59|60|61|62|63|64|65)\s*(°?C|℃|度)/i, /(15|16|17|18|19|20|21|22|23|24|25)\s*bp.{0,8}同源/i], minimumMatches: 3, guidance: '补齐引物长度、GC含量、Tm范围、上下游差值以及15–25 bp同源臂。' },
    { id: 's1-required-data', label: 'PCR验证与异常判断', dimension: 'analysis', patterns: [/Marker|分子量标准/i, /目标(条带|片段)|预期.{0,6}(bp|kb)/i, /无条带|杂带|非特异|二聚体|发夹/], minimumMatches: 2, guidance: '写明预期片段大小、Marker参照以及无条带或杂带时的判断和处理。' },
  ],
  2: [
    { id: 's2-required-principle', label: '方向性与读码框', dimension: 'knowledge', patterns: [/方向/, /读码框|移码/, /His.{0,4}标签|融合表达/i], minimumMatches: 3, guidance: '解释插入方向、读码框与His标签融合表达之间的因果关系。' },
    { id: 's2-required-operation', label: '构建与筛选顺序', dimension: 'operation', patterns: [/线性化/, /重组/, /DH5.?α|DH5a/i, /卡那|Kan/i], minimumMatches: 4, guidance: '按线性化、片段纯化、重组、DH5α转化和卡那霉素筛选的顺序写清操作。' },
    { id: 's2-required-data', label: '阳性克隆证据链', dimension: 'analysis', patterns: [/菌落PCR|菌落 PCR/i, /诊断(性)?酶切/, /测序/], minimumMatches: 2, guidance: '至少结合菌落PCR或诊断酶切进行初筛，并以测序确认序列、方向和读码框。' },
  ],
  3: [
    { id: 's3-required-principle', label: 'IPTG/T7因果链', dimension: 'knowledge', patterns: [/IPTG/i, /LacI|lacUV5/i, /T7 RNA聚合酶/i, /T7启动子/i], minimumMatches: 3, guidance: '说明IPTG解除LacI抑制、诱导T7 RNA聚合酶并驱动T7启动子的完整链条。' },
    { id: 's3-required-parameters', label: '诱导关键参数', dimension: 'operation', patterns: [/OD\s*600|对数期/i, /\d+(\.\d+)?\s*mM/i, /\d+\s*(°?C|℃|度)/i, /\d+\s*(h|小时|min|分钟)/i], minimumMatches: 4, guidance: '明确加IPTG时的OD600、终浓度、诱导温度和诱导时间。' },
    { id: 's3-required-data', label: '表达对照与判断', dimension: 'analysis', patterns: [/未诱导/, /空载体|阴性对照/, /SDS-?PAGE/i, /荧光|目标条带/], minimumMatches: 3, guidance: '用未诱导/空载体对照与SDS-PAGE或荧光证据判断表达，不能只凭菌液外观。' },
  ],
  4: [
    { id: 's4-required-principle', label: 'SDS-PAGE分离原理', dimension: 'knowledge', patterns: [/SDS/i, /负电|电荷/, /还原剂|DTT|巯基乙醇/i, /分子筛|分子量/], minimumMatches: 4, guidance: '解释SDS统一电荷、还原剂断开二硫键以及凝胶按分子量分离的原因。' },
    { id: 's4-required-operation', label: '裂解与上样参数', dimension: 'operation', patterns: [/低温|冰上|4\s*(°?C|℃|度)/i, /间歇.{0,6}超声|超声.{0,12}(功率|秒|分钟)/, /离心/, /等量上样|相同上样量/], minimumMatches: 3, guidance: '补充低温间歇超声、离心分组和等量上样条件，使样品处理可复核。' },
    { id: 's4-required-data', label: '泳道和可溶性推导', dimension: 'analysis', patterns: [/Marker/i, /未诱导/, /上清/, /沉淀/, /目标.{0,6}(kDa|条带)/i], minimumMatches: 4, guidance: '比较Marker、未诱导、上清和沉淀泳道，并从目标分子量条带分布推导可溶性。' },
  ],
  5: [
    { id: 's5-required-principle', label: 'Ni-NTA结合与洗脱原理', dimension: 'knowledge', patterns: [/Ni-?NTA/i, /His.{0,4}标签/i, /配位/, /咪唑.{0,8}(竞争|洗脱)/], minimumMatches: 3, guidance: '解释His标签与Ni²⁺配位及高浓度咪唑竞争洗脱的机制。' },
    { id: 's5-required-parameters', label: '缓冲体系参数', dimension: 'operation', patterns: [/pH\s*(7\.?[4-9]|8\.0)/i, /NaCl.{0,8}(300|400|500)\s*mM/i, /(20|30|40)\s*mM.{0,8}咪唑|咪唑.{0,8}(20|30|40)\s*mM/i, /(250|300|400|500)\s*mM.{0,8}咪唑|咪唑.{0,8}(250|300|400|500)\s*mM/i], minimumMatches: 3, guidance: '写明pH、盐浓度及结合/洗涤/洗脱阶段的咪唑浓度依据。' },
    { id: 's5-required-decision', label: '依据可溶性选择路线', dimension: 'decision', patterns: [/上清.{0,12}(天然|Ni-?NTA)|可溶.{0,12}(天然|Ni-?NTA)/i, /沉淀|包涵体/, /尿素|盐酸胍|变性/, /复性/], minimumMatches: 3, guidance: '根据步骤4上清/沉淀结果，在天然纯化与包涵体变性纯化复性之间作出有依据的选择。' },
  ],
  6: [
    { id: 's6-required-sequence', label: '纯化操作顺序', dimension: 'operation', patterns: [/平衡/, /上样/, /洗涤/, /洗脱/, /透析/], minimumMatches: 5, guidance: '按平衡、上样、洗涤、洗脱和透析顺序完整描述。' },
    { id: 's6-required-parameters', label: '咪唑梯度与条件', dimension: 'operation', patterns: [/(20|30|40)\s*mM/i, /(40|50|60)\s*mM/i, /(250|300|400|500)\s*mM/i, /4\s*(°?C|℃|度)|低温/i], minimumMatches: 3, guidance: '明确结合、洗涤和洗脱液的咪唑梯度，并说明低温操作。' },
    { id: 's6-required-data', label: '组分留样和损失判断', dimension: 'analysis', patterns: [/流穿/, /洗涤.{0,6}(组分|液|样)/, /洗脱.{0,6}(组分|液|样)/, /SDS-?PAGE/i], minimumMatches: 4, guidance: '保留并比较上样、流穿、洗涤和洗脱组分，用SDS-PAGE定位蛋白损失。' },
  ],
  7: [
    { id: 's7-required-principle', label: '纯度与身份验证', dimension: 'knowledge', patterns: [/SDS-?PAGE/i, /Western\s*Blot|免疫印迹/i, /ImageJ|灰度/i], minimumMatches: 3, guidance: '区分SDS-PAGE纯度判断、ImageJ相对定量和Western Blot身份确认。' },
    { id: 's7-required-operation', label: '验证操作条件', dimension: 'operation', patterns: [/等量上样|相同上样量/, /染色/, /脱色|曝光/, /重复/], minimumMatches: 3, guidance: '交代等量上样、染色/脱色或曝光条件和重复测量，确保灰度可比较。' },
    { id: 's7-required-data', label: '纯度合格推导', dimension: 'analysis', patterns: [/27\s*kDa/i, />\s*90\s*%|90\s*%以上|不低于\s*90\s*%/, /杂带|降解/, /目标条带.{0,12}(总蛋白|灰度)/], minimumMatches: 3, guidance: '结合预期分子量、目标条带灰度占比、杂带和降解情况判断是否达到90%纯度标准。' },
  ],
  8: [
    { id: 's8-required-principle', label: '显色定量原理', dimension: 'knowledge', patterns: [/BCA|Bradford/i, /吸光度|A\s*280|A280/i, /标准曲线/], minimumMatches: 3, guidance: '说明所选定量方法的显色/吸光原理，以及为何必须依赖标准曲线。' },
    { id: 's8-required-operation', label: '定量操作参数', dimension: 'operation', patterns: [/标准品|梯度/, /空白/, /平行|重复/, /稀释倍数|稀释因子/], minimumMatches: 4, guidance: '写清标准品梯度、空白、平行重复以及超出线性范围时的稀释倍数。' },
    { id: 's8-required-data', label: '曲线和浓度推导', dimension: 'analysis', patterns: [/R.?\s*[≥>]?\s*0\.99|0\.99/, /y\s*=|回归方程/i, /稀释倍数|稀释因子/, /误差|标准差|CV/i], minimumMatches: 3, guidance: '由回归方程代入吸光度并乘稀释倍数，检查R²≥0.99并分析重复误差。' },
  ],
};

export function detectRequiredEvidenceGaps(stepId: number, answer: string): RequiredEvidenceCheck[] {
  return (REQUIRED_EVIDENCE[stepId] ?? []).filter((check) => {
    const matches = check.patterns.filter((pattern) => pattern.test(answer)).length;
    return matches < check.minimumMatches;
  });
}

export function detectDeterministicGates(stepId: number, answer: string) {
  const normalized = answer.toLowerCase().replace(/\s+/g, ' ');
  return getExperimentStep(stepId).gates.filter((gate) =>
    gate.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())),
  );
}

function deriveStandardAnswer(stepId: number): string {
  const step = getExperimentStep(stepId);
  return step.keyPoints
    .map((point) => `【${point.label}】${point.hints.join('；')}`)
    .join('\n');
}

function nonEmptyText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeEvaluation(stepId: number, answer: string, input: TextEvaluation): TextEvaluation {
  const gates = detectDeterministicGates(stepId, answer);
  const evidenceGaps = detectRequiredEvidenceGaps(stepId, answer);
  const step = getExperimentStep(stepId);
  const scores = Object.fromEntries(
    Object.entries(DIMENSION_MAX).map(([key, max]) => {
      const raw = input.scores[key as keyof DimensionScores];
      return [key, Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : 0))];
    }),
  ) as unknown as DimensionScores;
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  for (const gap of evidenceGaps) {
    const cap = Math.ceil(DIMENSION_MAX[gap.dimension] * 0.65);
    scores[gap.dimension] = Math.min(scores[gap.dimension], cap);
  }
  const normalizedTotal = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const hasGate = gates.length > 0 || input.safetyAlerts.length > 0;
  const decision = hasGate || evidenceGaps.length > 0 ? 'revise' : normalizedTotal >= 80 ? 'pass' : input.decision;

  const fallbackIssues: DetailedFeedbackIssue[] = [
    ...input.incorrectPoints.map((point) => ({ point, kind: 'incorrect' as const })),
    ...input.ambiguousPhrases.map((point) => ({ point, kind: 'ambiguous' as const })),
    ...input.missingPoints.map((point) => ({ point, kind: 'missing' as const })),
    ...input.safetyAlerts.map((point) => ({ point, kind: 'safety' as const })),
  ].map(({ point, kind }) => ({
    dimension: getExperimentStep(stepId).keyPoints.find((item) => item.id === point.rubricId)?.dimension ?? 'operation',
    kind,
    title: point.label,
    evidence: { stepId, quote: '', attemptNo: 1 },
    scenario: '当前提交未提供可直接引用的完整证据。',
    impact: kind === 'safety' ? '可能导致方案无法通过Gate检查。' : '会削弱本步方案的完整性与可复核性。',
    causeBoundary: '只能确认本次文字描述存在该问题，不能据此推断日常学习习惯。',
    action: point.guidance,
    check: `重新提交时明确覆盖“${point.label}”，并给出可核对的条件或判断依据。`,
  }));

  return {
    ...input,
    schemaVersion: 'TextEvaluation.v2',
    decision,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    scores,
    missingPoints: [
      ...input.missingPoints,
      ...evidenceGaps.map((gap) => ({ rubricId: gap.id, label: gap.label, guidance: gap.guidance })),
    ],
    safetyAlerts: [
      ...input.safetyAlerts,
      ...gates.map((gate) => ({ rubricId: gate.id, label: gate.label, guidance: gate.guidance })),
    ],
    requiresTeacherReview: input.requiresTeacherReview || input.confidence < 0.65,
    detailedIssues: [
      ...(input.detailedIssues?.length ? input.detailedIssues : fallbackIssues),
      ...evidenceGaps.map((gap): DetailedFeedbackIssue => ({
        dimension: gap.dimension,
        kind: 'missing',
        title: gap.label,
        evidence: { stepId, quote: '', attemptNo: 1 },
        scenario: `本次第${stepId}步提交未提供足以核对“${gap.label}”的完整证据。`,
        impact: '关键原理、参数或数据推导不可复核，因此不能判定为已经掌握。',
        causeBoundary: '只能确认本次文字作答缺少证据，不推断学生的学习态度或真实操作能力。',
        action: gap.guidance,
        check: `修订后原文应能直接定位“${gap.label}”所需的全部条件与判断依据。`,
      })),
    ],
    strengths: input.strengths?.length
      ? input.strengths
      : input.coveredPoints.map((point) => point.label),
    reasoningReview: nonEmptyText(input.reasoningReview) ? input.reasoningReview : input.studentFeedback,
    standardAnswer: nonEmptyText(input.standardAnswer) ? input.standardAnswer : deriveStandardAnswer(stepId),
    improvedAnswer: nonEmptyText(input.improvedAnswer)
      ? input.improvedAnswer
      : [
        '在你的原回答基础上补全以下内容后重新表述：',
        ...[...input.missingPoints, ...input.incorrectPoints].map((point) => `- ${point.label}：${point.guidance}`),
        '- 保留原文中已被确认覆盖的部分，只修订缺失或错误的表述。',
      ].join('\n'),
    knowledgeExplanation: nonEmptyText(input.knowledgeExplanation)
      ? input.knowledgeExplanation
      : `本步核心目标：${step.goal}。背景：${step.context}`,
    nextAction: nonEmptyText(input.nextAction)
      ? input.nextAction
      : decision === 'pass'
        ? '本步已通过，请进入下一步并保持“依据—判断—后续动作”的表达方式。'
        : `请先补写：${[...input.missingPoints, ...input.incorrectPoints].slice(0, 2).map((point) => point.label).join('、') || '本步缺失的要点'}，然后重新提交。`,
  };
}

export function totalScore(scores: DimensionScores): number {
  return Object.values(scores).reduce((sum, score) => sum + score, 0);
}

export function assertEvaluation(value: unknown): TextEvaluation {
  if (!value || typeof value !== 'object') throw new AiValidationError('评阅结果不是对象');
  const data = value as Partial<TextEvaluation>;
  if (!['pass', 'revise', 'teacher_review'].includes(String(data.decision))) {
    throw new AiValidationError('评阅结果decision无效');
  }
  if (!data.scores || typeof data.studentFeedback !== 'string' || !Array.isArray(data.questions)) {
    throw new AiValidationError('评阅结果缺少必要字段');
  }
  const arrays = ['coveredPoints', 'missingPoints', 'incorrectPoints', 'ambiguousPhrases', 'safetyAlerts', 'knowledgeChunkIds'] as const;
  for (const key of arrays) if (!Array.isArray(data[key])) throw new AiValidationError(`评阅结果${key}无效`);
  if (data.strengths !== undefined && (!Array.isArray(data.strengths) || !data.strengths.every((item) => typeof item === 'string'))) {
    throw new AiValidationError('评阅结果strengths无效');
  }
  const optionalTextFields = ['reasoningReview', 'standardAnswer', 'improvedAnswer', 'knowledgeExplanation', 'nextAction'] as const;
  for (const key of optionalTextFields) {
    const field = data[key];
    if (field !== undefined && typeof field !== 'string') {
      throw new AiValidationError(`评阅结果${key}无效`);
    }
  }
  return {
    ...(data as TextEvaluation),
    schemaVersion: 'TextEvaluation.v2',
    detailedIssues: Array.isArray(data.detailedIssues) ? data.detailedIssues : [],
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    reasoningReview: typeof data.reasoningReview === 'string' ? data.reasoningReview : '',
    standardAnswer: typeof data.standardAnswer === 'string' ? data.standardAnswer : '',
    improvedAnswer: typeof data.improvedAnswer === 'string' ? data.improvedAnswer : '',
    knowledgeExplanation: typeof data.knowledgeExplanation === 'string' ? data.knowledgeExplanation : '',
    nextAction: typeof data.nextAction === 'string' ? data.nextAction : '',
  };
}

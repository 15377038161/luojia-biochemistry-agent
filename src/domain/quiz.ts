export interface StepQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  rationale: string;
}

export const stepQuizzes: Record<number, StepQuizQuestion[]> = {
  1: [
    { id: 's1-q1', prompt: '用于克隆到表达载体的 EGFP 序列应当是什么？', options: ['蛋白氨基酸序列', 'DNA 编码序列', 'mRNA 序列', '任意同源序列'], answerIndex: 1, rationale: '克隆需要的是 DNA 编码序列，要区分蛋白序列与用于克隆的 DNA 编码序列。' },
    { id: 's1-q2', prompt: 'PCR 引物的 Tm 值通常应控制在什么范围？', options: ['30°C 左右', '55–65°C 附近', '80°C 以上', '越低越好'], answerIndex: 1, rationale: '引物 Tm 通常应在 55–65°C 附近，上下游差值不宜过大。' },
  ],
  2: [
    { id: 's2-q1', prompt: '构建表达载体时为什么要进行双酶切方向性克隆？', options: ['单纯为了提高连接效率', '保证插入片段方向正确、与 His 标签读码框一致', '为了减少载体自连', '为了让转化更快'], answerIndex: 1, rationale: '表达载体必须保持正确方向和读码框，才能正确表达融合蛋白。' },
    { id: 's2-q2', prompt: '确认载体构建成功最终依靠什么证据？', options: ['平板上长出菌落即可', '仅靠抗性筛选', '菌落 PCR 或诊断酶切验证方向性，最终测序确认', '菌液变浑浊即可'], answerIndex: 2, rationale: '仅有菌落不足以证明构建成功，应由方向性验证和测序共同确认。' },
  ],
  3: [
    { id: 's3-q1', prompt: 'BL21(DE3) 菌株的主要用途是什么？', options: ['克隆扩增质粒', 'T7 系统表达目标蛋白', '去除内毒素', '进行糖基化修饰'], answerIndex: 1, rationale: 'DH5α 主要用于克隆，BL21(DE3) 用于 T7 系统表达。' },
    { id: 's3-q2', prompt: 'IPTG 在 T7 表达系统中的作用是什么？', options: ['解除对 T7 RNA 聚合酶的调控，启动目标基因转录', '直接结合目标蛋白促进折叠', '为菌体提供碳源', '提高质粒拷贝数'], answerIndex: 0, rationale: 'IPTG 解除 lac 调控，使 T7 RNA 聚合酶驱动目标基因转录。' },
  ],
  4: [
    { id: 's4-q1', prompt: 'SDS-PAGE 分离蛋白的主要依据是什么？', options: ['等电点', '分子大小', '疏水性强弱', '天然电荷'], answerIndex: 1, rationale: 'SDS 使蛋白变性并统一电荷密度，电泳按分子大小分离。' },
    { id: 's4-q2', prompt: '判断目标蛋白可溶性时，应当比较哪些样品？', options: ['只跑全菌总蛋白即可', '裂解上清与沉淀中目标条带的分布', '培养基颜色变化', '仅测总蛋白浓度'], answerIndex: 1, rationale: '必须比较裂解上清和沉淀中的目标条带，仅凭总蛋白不能判断可溶性。' },
  ],
  5: [
    { id: 's5-q1', prompt: 'His 标签与 Ni-NTA 树脂结合依靠什么作用？', options: ['离子键', '组氨酸残基与镍离子的配位作用', '二硫键', '疏水相互作用'], answerIndex: 1, rationale: 'His 标签通过组氨酸与镍离子配位结合到树脂上。' },
    { id: 's5-q2', prompt: '咪唑能够洗脱目标蛋白的原理是什么？', options: ['使蛋白变性脱落', '与 His 标签竞争镍离子结合位点', '酶切切断标签', '改变蛋白分子量'], answerIndex: 1, rationale: '咪唑与 His 标签竞争镍结合位点，实现竞争洗脱。' },
  ],
  6: [
    { id: 's6-q1', prompt: '纯化过程中应当保留哪些关键组分留样？', options: ['只留洗脱峰即可', '上样、流穿、洗涤、洗脱等关键组分', '不需要留样', '只留最初菌液'], answerIndex: 1, rationale: '应保留关键组分，才能定位蛋白损失和判断纯化效果。' },
    { id: 's6-q2', prompt: '上样流速过快主要会导致什么后果？', options: ['提高目标蛋白产量', '树脂结合不充分，目标蛋白出现在流穿中', '洗脱更完全', '没有任何影响'], answerIndex: 1, rationale: '上样过快会使树脂结合不充分，目标蛋白随流穿损失。' },
  ],
  7: [
    { id: 's7-q1', prompt: '出现单一目标条带就一定代表蛋白绝对纯净吗？', options: ['一定纯净', '不能等同，纯度还需评估杂带比例并确认条带身份', '取决于胶浓度', '取决于染色方法'], answerIndex: 1, rationale: '目标条带存在只能说明检测到目标大小附近蛋白，纯度需评估杂带及身份。' },
    { id: 's7-q2', prompt: 'ImageJ 灰度分析在纯度验证中的作用是什么？', options: ['鉴定蛋白身份', '对条带灰度做相对定量，辅助判断纯度', '测定蛋白活性', '直接读取分子量'], answerIndex: 1, rationale: 'ImageJ 做的是相对灰度分析，用于辅助纯度判断，身份需 Western Blot 等手段确认。' },
  ],
  8: [
    { id: 's8-q1', prompt: 'BCA/Bradford 法定量蛋白浓度必须依靠什么？', options: ['目测颜色深浅', '有效标准曲线', '单一标准品点', '文献参考值'], answerIndex: 1, rationale: 'BCA/Bradford 定量必须依赖有效标准曲线，不能目测。' },
    { id: 's8-q2', prompt: '课程对标准曲线线性的要求是什么？', options: ['R²≥0.6 即可', 'R²≥0.99', '没有明确要求', 'R²≥0.9 即可'], answerIndex: 1, rationale: '课程给出的标准为标准曲线 R²≥0.99。' },
  ],
};

export function getStepQuiz(stepId: number): StepQuizQuestion[] {
  return stepQuizzes[stepId] || [];
}

export interface CourseImageQuestion {
  id: string;
  stepId: number;
  imagePath: string;
  prompt: string;
  labels: string[];
  source: string;
}

export const courseImageQuestions: CourseImageQuestion[] = [
  { id: 'img-s1-pcr', stepId: 1, imagePath: '/course-assets/pcr-result.jpg', prompt: '请观察这张PCR鉴定图：你会用哪些证据判断扩增是否符合预期？如果缺少Marker或泳道说明，哪些结论不能下？', labels: ['PCR结果', 'Marker', '目标条带', '非特异条带'], source: '07 图片/结果图片/PCR鉴定结果.jpg' },
  { id: 'img-s2-digest', stepId: 2, imagePath: '/course-assets/pet28-digest.jpg', prompt: '这是pET28a质粒提取和酶切结果。请说明你会怎样结合泳道和片段大小判断载体处理是否成功。', labels: ['pET28a', '酶切', '泳道', '片段大小'], source: '07 图片/结果图片/pET28a质粒提取和酶切.jpg' },
  { id: 'img-s3-bl21', stepId: 3, imagePath: '/course-assets/bl21-transformation.jpg', prompt: '请识别图片反映的实验环节，并说明仅凭平板或菌落现象能确认什么、不能确认什么。', labels: ['BL21转化', '菌落', '抗性筛选'], source: '07 图片/结果图片/质粒转化BL21.jpg' },
  { id: 'img-s4-sonicator', stepId: 4, imagePath: '/course-assets/sonicator.jpg', prompt: '这是什么仪器？在菌体裂解时如何使用？请特别说明温度控制和安全注意点。', labels: ['超声波破碎仪', '菌体裂解', '间歇超声', '低温'], source: '07 图片/仪器设备/超声波破碎仪.jpg' },
  { id: 'img-s5-centrifuge', stepId: 5, imagePath: '/course-assets/refrigerated-centrifuge.jpg', prompt: '请识别该仪器，并说明它在可溶性蛋白与包涵体判断中的作用。', labels: ['高速冷冻离心机', '上清', '沉淀', '低温'], source: '07 图片/仪器设备/高速冷冻离心机.jpg' },
  { id: 'img-s6-purification', stepId: 6, imagePath: '/course-assets/protein-purification-result.jpg', prompt: '请根据可见条带说明纯化效果。若没有Marker、泳道定义或上样量信息，应保留哪些判断？', labels: ['蛋白纯化', 'SDS-PAGE', '目标条带', '杂带'], source: '07 图片/结果图片/蛋白纯化结果.jpg' },
  { id: 'img-s7-induction', stepId: 7, imagePath: '/course-assets/protein-induction.jpg', prompt: '请比较图片中的蛋白条带，并说明判断诱导表达和纯度分别需要什么证据。', labels: ['诱导表达', '目标分子量', '对照', '纯度'], source: '07 图片/结果图片/蛋白质诱导表达.jpg' },
  { id: 'img-s8-nanodrop', stepId: 8, imagePath: '/course-assets/nanodrop.jpg', prompt: '请识别仪器，并说明使用微量紫外吸收法测蛋白浓度前需要确认哪些条件和干扰因素。', labels: ['微量核酸蛋白定量分析仪', 'A280', '消光系数', '核酸污染'], source: '07 图片/仪器设备/微量核酸蛋白质定量分析仪.jpg' },
];

export function imageQuestionForStep(stepId: number): CourseImageQuestion {
  return courseImageQuestions.find((item) => item.stepId === stepId) || courseImageQuestions[0];
}

import { createHash } from 'crypto';
import { experimentSteps } from '../src/domain/experiment';
import { courseImageQuestions } from '../src/domain/media';
import { getSupabaseAdminClient } from '../src/lib/supabase-client';

const EXPERIMENT_ID = '10000000-0000-4000-8000-000000000003';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const instruments = [
  { name: '超声波破碎仪', image_path: '/course-assets/sonicator.jpg', purpose: '低温间歇超声破碎菌体', applicable_steps: [4], safety_points: ['佩戴听力防护', '探头不得空载', '全程低温并间歇工作'], source_ref: '07 图片/仪器设备/超声波破碎仪.jpg' },
  { name: '高速冷冻离心机', image_path: '/course-assets/refrigerated-centrifuge.jpg', purpose: '低温分离裂解上清和沉淀', applicable_steps: [4, 5, 6], safety_points: ['转子配平', '确认转子额定转速', '停稳后开盖'], source_ref: '07 图片/仪器设备/高速冷冻离心机.jpg' },
  { name: '微量核酸蛋白质定量分析仪', image_path: '/course-assets/nanodrop.jpg', purpose: '用微量样品测量紫外吸收和蛋白浓度', applicable_steps: [8], safety_points: ['使用匹配空白', '避免气泡和样品残留'], source_ref: '07 图片/仪器设备/微量核酸蛋白质定量分析仪.jpg' },
  { name: '酶标仪', image_path: '/course-assets/microplate-reader.jpg', purpose: '读取BCA反应的A562吸光度', applicable_steps: [8], safety_points: ['确认板型与波长', '避免孔内气泡'], source_ref: '07 图片/仪器设备/酶标仪.jpg' },
  { name: '分光光度计', image_path: '/course-assets/spectrophotometer.jpg', purpose: '测量样品在指定波长的吸光度', applicable_steps: [8], safety_points: ['比色皿方向一致', '使用正确空白'], source_ref: '07 图片/仪器设备/分光光度计.jpg' },
];

async function main() {
  const supabase = getSupabaseAdminClient();
  for (const step of experimentSteps) {
    const { data: stepRow, error: stepError } = await supabase.from('experiment_steps').upsert({
      experiment_id: EXPERIMENT_ID,
      step_no: step.id,
      slug: step.slug,
      title: step.title,
      context: step.context,
      goal: step.goal,
      content: { keyPoints: step.keyPoints, gates: step.gates },
      source_ref: step.source,
    }, { onConflict: 'experiment_id,step_no' }).select('id').single();
    if (stepError) throw stepError;

    const { data: rubric, error: rubricError } = await supabase.from('rubrics').upsert({
      step_id: stepRow.id,
      version: 1,
      pass_score: 80,
      status: 'published',
      source_ref: '04_评分与题库.docx',
    }, { onConflict: 'step_id,version' }).select('id').single();
    if (rubricError) throw rubricError;
    const weights = { knowledge: 20, operation: 30, decision: 20, troubleshooting: 15, analysis: 15 };
    const { error: itemsError } = await supabase.from('rubric_items').upsert(step.keyPoints.map((point) => ({
      rubric_id: rubric.id,
      code: point.id,
      dimension: point.dimension,
      label: point.label,
      weight: weights[point.dimension],
      required_points: [point.label],
      accepted_phrases: [],
      gates: step.gates.filter((gate) => gate.id.startsWith(`s${step.id}-`)),
      hints: point.hints,
    })), { onConflict: 'rubric_id,code' });
    if (itemsError) throw itemsError;
  }

  await supabase.from('knowledge_chunks').delete().eq('experiment_id', EXPERIMENT_ID);
  const chunks = experimentSteps.flatMap((step) => step.keyPoints.map((point) => ({
    experiment_id: EXPERIMENT_ID,
    step_no: step.id,
    kind: 'rubric_guidance',
    title: point.label,
    content: `${step.context}\n${step.goal}\n追问：${point.hints.join('；')}`,
    structured_data: { dimension: point.dimension, hints: point.hints },
    source_file: '04_评分与题库.docx',
    source_location: `步骤${step.id} ${point.label}`,
    source_hash: hash({ step: step.id, point }),
    version: 1,
    teacher_confirmed: true,
  })));
  const { error: chunkError } = await supabase.from('knowledge_chunks').insert(chunks);
  if (chunkError) throw chunkError;

  await supabase.from('instrument_catalog').delete().eq('experiment_id', EXPERIMENT_ID);
  const { error: instrumentError } = await supabase.from('instrument_catalog').insert(instruments.map((item) => ({ experiment_id: EXPERIMENT_ID, aliases: [], ...item })));
  if (instrumentError) throw instrumentError;

  await supabase.from('image_questions').delete().eq('experiment_id', EXPERIMENT_ID);
  const { error: imageError } = await supabase.from('image_questions').insert(courseImageQuestions.map((item) => ({
    experiment_id: EXPERIMENT_ID,
    step_no: item.stepId,
    prompt: item.prompt,
    image_path: item.imagePath,
    labels: item.labels,
    safety_critical: item.stepId === 4,
    source_ref: item.source,
  })));
  if (imageError) throw imageError;

  const manifest = { steps: experimentSteps, images: courseImageQuestions, instruments };
  const { error: versionError } = await supabase.from('content_versions').upsert({
    experiment_id: EXPERIMENT_ID,
    version: 1,
    manifest,
    source_hash: hash(manifest),
    published_at: new Date().toISOString(),
  }, { onConflict: 'experiment_id,version' });
  if (versionError) throw versionError;
  console.log(`已导入${experimentSteps.length}个步骤、${chunks.length}个知识块、${courseImageQuestions.length}道图片题。`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

/**
 * 批量生成知识点检验题目池
 * 用法：pnpm tsx scripts/generate-quiz-pool.ts [stepNo] [count]
 * 示例：pnpm tsx scripts/generate-quiz-pool.ts 1 100  （为步骤 1 生成 100 道题）
 */
import { createClient } from '@supabase/supabase-js';
import { generateQuizQuestions } from '../src/lib/coze-workflows';
import { getExperimentStep } from '../src/domain/experiment';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const stepNo = parseInt(process.argv[2] || '1');
  const count = parseInt(process.argv[3] || '100');
  const batchSize = 5; // 每次生成 5 题

  const step = getExperimentStep(stepNo);
  if (!step) {
    console.error(`步骤 ${stepNo} 不存在`);
    process.exit(1);
  }

  console.log(`为步骤 ${stepNo}「${step.title}」生成 ${count} 道题目...`);

  let generated = 0;
  const batches = Math.ceil(count / batchSize);

  for (let i = 0; i < batches; i++) {
    const remaining = count - generated;
    const currentBatchSize = Math.min(batchSize, remaining);

    try {
      const { data: questions } = await generateQuizQuestions(stepNo, currentBatchSize);

      for (const q of questions) {
        // 随机分配维度（确保三个维度都有覆盖）
        const dimensions = ['knowledge', 'detail', 'data'];
        const dimension = dimensions[Math.floor(Math.random() * dimensions.length)];

        const { error } = await supabase.from('quiz_questions').insert({
          step_no: stepNo,
          dimension,
          question_text: q.question_text,
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation,
        });

        if (error) {
          console.error(`插入失败：${error.message}`);
        } else {
          generated++;
        }
      }

      console.log(`进度：${generated}/${count} (${Math.round(generated / count * 100)}%)`);

      // 避免速率限制，每批间隔 2 秒
      if (i < batches - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`批次 ${i + 1} 失败：`, err);
      // 重试一次
      i--;
    }
  }

  console.log(`完成！共生成 ${generated} 道题目`);
}

main().catch(console.error);

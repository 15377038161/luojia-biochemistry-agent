import type { SupabaseClient } from '@supabase/supabase-js';
import { generateQuizQuestions } from '@/lib/coze-workflows';

/**
 * 题目池预生成与动态扩容服务。
 *
 * 解决「知识点检验」的两个核心痛点：
 * 1. 实时 LLM 生成延迟高 —— 改为预先生成题目到 quiz_questions（status=published），
 *    学生分发时只做数据库读取，不再触发 LLM（延迟 < 200ms）。
 * 2. 题目池耗尽导致「暂时没有更多新题」—— 通过水位监测 + 批量扩容保持池子充足。
 *
 * 权限边界：写入 quiz_questions 受 RLS `is_teacher_user()` 约束，因此预生成/扩容
 * 必须由教师身份的 Supabase 客户端（identity.supabase）调用，学生端只读分发。
 */

type QuestionDimension = 'knowledge' | 'detail' | 'data';

const DIMENSIONS: QuestionDimension[] = ['knowledge', 'detail', 'data'];

/** 题目池最低水位：低于该值视为「将耗尽」，触发扩容 */
export const MIN_POOL_SIZE = 30;

/** 扩容目标水位：预生成后每步 published 题目应达到的数量 */
export const TARGET_POOL_SIZE = 60;

/** 单轮 LLM 生成数量（过大易触发输出截断/质量下降） */
const EXPAND_BATCH_SIZE = 15;

/** 归一化题干文本，用于跨轮次去重 */
export function normalizeQuestionText(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、,.!?]/g, '');
}

/**
 * 从题目池中排除已分配题目并随机抽取 count 道（Fisher-Yates 洗牌，避免 sort 随机偏置）。
 * 纯函数，便于单测验证「去重 + 随机分发」逻辑。
 */
export function pickRandomUnassigned<T extends { id: string }>(
  pool: readonly T[],
  assignedIds: ReadonlySet<string>,
  count: number,
): T[] {
  const available = pool.filter((item) => !assignedIds.has(item.id));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

/** 统计某步骤已发布（published）题目数量 */
export async function countPublishedQuestions(
  supabase: SupabaseClient,
  stepNo: number,
): Promise<number> {
  const { count, error } = await supabase
    .from('quiz_questions')
    .select('id', { count: 'exact', head: true })
    .eq('step_no', stepNo)
    .eq('status', 'published');
  if (error) throw error;
  return count ?? 0;
}

/**
 * 批量预生成题目并直接发布到池中（status=published）。
 * 带回环去重：先读取已有题干归一化集合，生成后跳过重复项；数据库唯一索引
 * `quiz_questions_step_text_unique_idx` 作为兜底防线。
 *
 * @returns 本次实际新增的题目数量
 */
export async function expandQuestionPool(
  supabase: SupabaseClient,
  stepNo: number,
  target: number = TARGET_POOL_SIZE,
): Promise<number> {
  const current = await countPublishedQuestions(supabase, stepNo);
  if (current >= target) return 0;

  const { data: existingRows, error: existingError } = await supabase
    .from('quiz_questions')
    .select('question_text')
    .eq('step_no', stepNo);
  if (existingError) throw existingError;

  const seen = new Set<string>(
    (existingRows ?? []).map((row) => normalizeQuestionText(String(row.question_text))),
  );

  const missing = target - current;
  // 每轮生成 EXPAND_BATCH_SIZE 题，最多多尝试两轮应对重复率
  const maxRounds = Math.ceil(missing / EXPAND_BATCH_SIZE) + 2;
  let added = 0;

  for (let round = 0; round < maxRounds && current + added < target; round++) {
    const generated = await generateQuizQuestions(stepNo, EXPAND_BATCH_SIZE);

    const rows: Array<Record<string, unknown>> = [];
    for (const item of generated.data) {
      const normalized = normalizeQuestionText(item.question_text);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      rows.push({
        id: item.question_id,
        step_no: stepNo,
        dimension: DIMENSIONS[round % DIMENSIONS.length],
        question_text: item.question_text,
        options: item.options,
        correct_option_id: item.correct_option_id,
        explanation: item.explanation,
        status: 'published',
      });
    }

    if (rows.length) {
      const { error: insertError } = await supabase.from('quiz_questions').insert(rows);
      if (insertError) throw insertError;
      added += rows.length;
    }
  }

  return added;
}

/**
 * 确保题目池水位：低于 MIN_POOL_SIZE 时自动扩容到 TARGET_POOL_SIZE。
 * @returns 扩容后的可用题目数与本轮新增数
 */
export async function ensureQuestionPool(
  supabase: SupabaseClient,
  stepNo: number,
): Promise<{ available: number; expanded: number }> {
  const available = await countPublishedQuestions(supabase, stepNo);
  if (available >= MIN_POOL_SIZE) {
    return { available, expanded: 0 };
  }
  const expanded = await expandQuestionPool(supabase, stepNo, TARGET_POOL_SIZE);
  return { available: available + expanded, expanded };
}

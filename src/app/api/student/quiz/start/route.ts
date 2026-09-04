import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import { generateQuizQuestions, type QuizQuestion } from '@/lib/coze-workflows';

interface QuizQuestionRow {
  id: string;
  question_text: string;
  options: QuizQuestion['options'];
  correct_option_id: string;
  explanation: string;
}

function clientQuestions(questions: QuizQuestion[]) {
  return questions.map(({ question_id, question_text, options }) => ({ question_id, question_text, options }));
}

function normalizedQuestionText(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、,.!?]/g, '');
}

/**
 * POST /api/student/quiz/start
 * 开始知识点检验：生成题目并创建 quiz_session
 * Body: { stepNo: number }
 * Response: { session_id: string, questions: QuizQuestion[] }
 */
export async function POST(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    }
    const supabase = getSupabaseAdminClient();

    const body = (await req.json()) as { stepNo?: unknown };
    const stepNo = Number(body.stepNo);
    if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > 8) {
      return fail({ code: 'VALIDATION_ERROR', message: 'stepNo 必须是 1-8 的整数', retryable: false });
    }

    const { data: activeSession, error: activeError } = await supabase.from('quiz_sessions')
      .select('id,questions').eq('user_id', identity.user.id).eq('step_no', stepNo).eq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (activeError) throw activeError;
    if (activeSession) {
      return ok({ session_id: activeSession.id, questions: clientQuestions(activeSession.questions as QuizQuestion[]) });
    }

    const { data: historyRows, error: historyError } = await supabase.from('quiz_sessions')
      .select('questions').eq('user_id', identity.user.id).eq('step_no', stepNo);
    if (historyError) throw historyError;
    const seenIds = new Set<string>();
    const seenTexts = new Set<string>();
    for (const row of historyRows ?? []) {
      for (const question of row.questions as QuizQuestion[]) {
        seenIds.add(question.question_id);
        seenTexts.add(normalizedQuestionText(question.question_text));
      }
    }

    let questions: QuizQuestion[] = [];
    const { data: poolQuestions, error: poolError } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('step_no', stepNo)
      .order('id', { ascending: false })
      .limit(300);
    if (poolError) throw poolError;

    const unseenPool = ((poolQuestions ?? []) as QuizQuestionRow[]).filter((q) => !seenIds.has(q.id) && !seenTexts.has(normalizedQuestionText(q.question_text)));
    questions = unseenPool.sort(() => Math.random() - 0.5).slice(0, 5).map((q) => ({
        question_id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_option_id: q.correct_option_id,
        explanation: q.explanation,
      }));

    if (questions.length < 5) {
      const needed = 5 - questions.length;
      const result = await generateQuizQuestions(stepNo, Math.max(needed + 3, 5));
      const existingTexts = new Set([...(poolQuestions ?? []).map((q) => normalizedQuestionText(String(q.question_text))), ...seenTexts]);
      const generated = result.data.filter((q) => !existingTexts.has(normalizedQuestionText(q.question_text))).slice(0, needed);
      for (let index = 0; index < generated.length; index += 1) {
        const q = generated[index];
        const { error } = await supabase.from('quiz_questions').insert({
          id: q.question_id,
          step_no: stepNo,
          dimension: ['knowledge', 'detail', 'data'][index % 3],
          question_text: q.question_text,
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation,
        });
        if (error) throw error;
      }
      questions.push(...generated);
    }
    if (questions.length < 5) {
      return fail({ code: 'AI_OUTPUT_INVALID', message: '暂时无法生成足够的不重复题目，请稍后重试。', retryable: true }, undefined, 503);
    }

    // 创建 quiz_session
    const { data: session, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: identity.user.id,
        step_no: stepNo,
        questions,
        answers: {},
        results: null,
        status: 'in_progress',
      })
      .select('id, questions')
      .single();

    if (insertError) {
      return fail(errorFromUnknown(insertError));
    }

    // 返回时隐藏 correct_option_id 和 explanation（防止客户端作弊）
    return ok({ session_id: session.id, questions: clientQuestions(questions) });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

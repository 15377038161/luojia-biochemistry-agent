import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import type { QuizQuestion } from '@/lib/coze-workflows';

/**
 * POST /api/student/quiz/submit
 * 提交所有答案并批改
 * Body: { session_id: string, answers: Record<question_id, selected_option_id> }
 * Response: { results: QuizResult[], score: number, total: number }
 */
export async function POST(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    }
    const supabase = getSupabaseAdminClient();

    const body = await req.json();
    const { session_id, answers } = body as {
      session_id: string;
      answers: Record<string, string>;
    };

    if (!session_id || !answers || typeof answers !== 'object') {
      return fail({ code: 'VALIDATION_ERROR', message: 'session_id 和 answers 必填', retryable: false });
    }

    // 读取 quiz_session（含完整题目）
    const { data: session, error: fetchError } = await supabase
      .from('quiz_sessions')
      .select('id, user_id, questions, status')
      .eq('id', session_id)
      .eq('user_id', identity.user.id)
      .single();

    if (fetchError || !session) {
      return fail(errorFromUnknown(fetchError || new Error('会话不存在')), '读取测验会话失败');
    }

    if (session.status === 'graded') {
      return fail({ code: 'STATE_INVALID', message: '该测验已提交，不可重复提交', retryable: false });
    }

    const questions = session.questions as QuizQuestion[];
    const questionIds = new Set(questions.map((question) => question.question_id));
    const answerIds = Object.keys(answers);
    if (answerIds.length !== questions.length || answerIds.some((id) => !questionIds.has(id))) {
      return fail({ code: 'VALIDATION_ERROR', message: '请完成全部题目后再最终提交。', retryable: false });
    }
    for (const question of questions) {
      if (!question.options.some((option) => option.id === answers[question.question_id])) {
        return fail({ code: 'VALIDATION_ERROR', message: '作答选项无效，请刷新后重试。', retryable: false });
      }
    }

    // 批改：对比 correct_option_id
    const results = questions.map((q) => {
      const userAnswer = answers[q.question_id];
      const isCorrect = userAnswer === q.correct_option_id;
      return {
        question_id: q.question_id,
        user_answer: userAnswer || null,
        correct_answer: q.correct_option_id,
        is_correct: isCorrect,
        explanation: q.explanation,
      };
    });

    const score = results.filter((r) => r.is_correct).length;
    const total = questions.length;

    // 更新 quiz_session
    const completedAt = new Date().toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from('quiz_sessions')
      .update({
        answers,
        results,
        status: 'graded',
        submitted_at: completedAt,
        graded_at: completedAt,
      })
      .eq('id', session_id)
      .eq('user_id', identity.user.id)
      .eq('status', 'in_progress')
      .select('id')
      .maybeSingle();

    if (updateError) {
      return fail(errorFromUnknown(updateError));
    }
    if (!updatedSession) {
      return fail({ code: 'STATE_INVALID', message: '测验状态已变化，请刷新后重试。', retryable: false });
    }

    return ok({ results, score, total });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

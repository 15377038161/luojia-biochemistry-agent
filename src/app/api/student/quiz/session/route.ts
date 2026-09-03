import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import type { QuizQuestion } from '@/lib/coze-workflows';

type QuizQuestionForClient = Pick<QuizQuestion, 'question_id' | 'question_text' | 'options'>;

/**
 * GET /api/student/quiz/session?session_id=xxx
 * 加载已有测验会话（用于页面刷新恢复状态）
 * Response: { questions, answers, results, status, graded_at }
 */
export async function GET(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    }
    const supabase = getSupabaseAdminClient();

    const sessionId = req.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return fail({ code: 'VALIDATION_ERROR', message: 'session_id 必填', retryable: false });
    }

    const { data: session, error } = await supabase
      .from('quiz_sessions')
      .select('questions, answers, results, status, submitted_at, graded_at')
      .eq('id', sessionId)
      .eq('user_id', identity.user.id)
      .single();

    if (error || !session) {
      return fail(errorFromUnknown(error || new Error('会话不存在')), '读取测验会话失败');
    }

    // 如果未完成，隐藏 questions 中的 correct_option_id 和 explanation
    let questions: QuizQuestionForClient[] = session.questions as QuizQuestion[];
    if (session.status !== 'graded') {
      questions = questions.map((q) => ({
        question_id: q.question_id,
        question_text: q.question_text,
        options: q.options,
      }));
    }

    return ok({
      questions,
      answers: session.answers || {},
      results: session.results || null,
      status: session.status,
      submitted_at: session.submitted_at,
      graded_at: session.graded_at,
    });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

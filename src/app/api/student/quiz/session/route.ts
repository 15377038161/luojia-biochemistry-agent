import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';

/**
 * GET /api/student/quiz/session?session_id=xxx
 * 加载已有测验会话（用于页面刷新恢复状态）
 * Response: { questions, answers, results, completed_at }
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: '未登录' }), {
        status: 401,
      });
    }

    const sessionId = req.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return new Response(
        JSON.stringify({ code: 'INVALID_PARAM', message: 'session_id 必填' }),
        { status: 400 },
      );
    }

    const { data: session, error } = await supabase
      .from('quiz_sessions')
      .select('questions, answers, results, completed_at')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (error || !session) {
      return fail(errorFromUnknown(error || new Error('会话不存在')), '读取测验会话失败');
    }

    // 如果未完成，隐藏 questions 中的 correct_option_id 和 explanation
    let questions = session.questions as any[];
    if (!session.completed_at) {
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
      completed_at: session.completed_at,
    });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

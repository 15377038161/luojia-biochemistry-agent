import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
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
    const supabase = getSupabaseAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: '未登录' }), {
        status: 401,
      });
    }

    const body = await req.json();
    const { session_id, answers } = body as {
      session_id: string;
      answers: Record<string, string>;
    };

    if (!session_id || !answers || typeof answers !== 'object') {
      return new Response(
        JSON.stringify({ code: 'INVALID_PARAM', message: 'session_id 和 answers 必填' }),
        { status: 400 },
      );
    }

    // 读取 quiz_session（含完整题目）
    const { data: session, error: fetchError } = await supabase
      .from('quiz_sessions')
      .select('id, user_id, questions, completed_at')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !session) {
      return fail(errorFromUnknown(fetchError || new Error('会话不存在')), '读取测验会话失败');
    }

    if (session.completed_at) {
      return new Response(
        JSON.stringify({ code: 'ALREADY_COMPLETED', message: '该测验已提交，不可重复提交' }),
        { status: 400 },
      );
    }

    const questions = session.questions as QuizQuestion[];

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
    const { error: updateError } = await supabase
      .from('quiz_sessions')
      .update({
        answers,
        results,
        completed_at: new Date().toISOString(),
      })
      .eq('id', session_id);

    if (updateError) {
      return fail(errorFromUnknown(updateError));
    }

    return ok({ results, score, total });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

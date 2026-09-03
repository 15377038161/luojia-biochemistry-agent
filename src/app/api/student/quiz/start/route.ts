import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import { generateQuizQuestions } from '@/lib/coze-workflows';

/**
 * POST /api/student/quiz/start
 * 开始知识点检验：生成题目并创建 quiz_session
 * Body: { stepNo: number }
 * Response: { session_id: string, questions: QuizQuestion[] }
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
    const stepNo = Number(body.stepNo);
    if (!stepNo || stepNo < 1 || stepNo > 8) {
      return new Response(
        JSON.stringify({ code: 'INVALID_PARAM', message: 'stepNo 必须是 1-8 的整数' }),
        { status: 400 },
      );
    }

    // 生成题目（AI workflow，每次随机）
    const { data: questions } = await generateQuizQuestions(stepNo, 5);

    // 创建 quiz_session
    const { data: session, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        step_no: stepNo,
        questions,
        answers: {},
        results: null,
        completed_at: null,
      })
      .select('id, questions')
      .single();

    if (insertError) {
      return fail(errorFromUnknown(insertError));
    }

    // 返回时隐藏 correct_option_id 和 explanation（防止客户端作弊）
    const questionsForClient = questions.map((q) => ({
      question_id: q.question_id,
      question_text: q.question_text,
      options: q.options,
    }));

    return ok({ session_id: session.id, questions: questionsForClient });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

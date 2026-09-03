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

    // 从题库随机抽题（优先），若无题库则现场 AI 生成
    let questions: any[];
    const { data: poolQuestions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('step_no', stepNo)
      .order('id', { ascending: false })
      .limit(15); // 取 15 道，再随机抽 5 道

    if (poolQuestions && poolQuestions.length >= 5) {
      // 从题库随机抽 5 道
      const shuffled = poolQuestions.sort(() => Math.random() - 0.5);
      questions = shuffled.slice(0, 5).map((q) => ({
        question_id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_option_id: q.correct_option_id,
        explanation: q.explanation,
      }));
      console.log(`[quiz/start] 从题库抽题 5 道 (step=${stepNo})`);
    } else {
      // 题库不足，现场 AI 生成
      console.log(`[quiz/start] 题库不足 (${poolQuestions?.length || 0} 道)，现场 AI 生成`);
      const result = await generateQuizQuestions(stepNo, 5);
      questions = result.data;

      // 入库备用
      for (const q of questions) {
        const { error } = await supabase.from('quiz_questions').insert({
          step_no: stepNo,
          dimension: 'knowledge',
          question_text: q.question_text,
          options: q.options,
          correct_option_id: q.correct_option_id,
          explanation: q.explanation,
        });
        if (error) console.error('[quiz/start] 入库失败:', error.message);
      }
    }

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

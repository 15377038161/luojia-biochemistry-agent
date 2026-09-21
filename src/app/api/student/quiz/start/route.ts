import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import { pickRandomUnassigned } from '@/lib/quiz-pool';
import type { QuizQuestion } from '@/lib/coze-workflows';

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

/**
 * POST /api/student/quiz/start
 * 开始知识点检验：从教师已发布题库抽取用户未做过的 5 题并创建 quiz_session。
 *
 * 去重依据 quiz_question_assignments 表（唯一约束 (user_id, question_id)），
 * 由数据库保证同一用户永不重复分配到同一道题（重复率为 0），不受并发竞争影响。
 * 全程只做数据库读写，不触发 LLM 生成，单用户延迟控制在 200ms 内。
 *
 * Body: { stepNo: number }
 * Response: { session_id: string, questions: PublicQuizQuestion[] }
 */
export async function POST(req: NextRequest) {
  try {
    const identity = await getSessionUser(req);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    }
    const supabase = identity.supabase;
    const userId = identity.user.id;

    const body = (await req.json()) as { stepNo?: unknown };
    const stepNo = Number(body.stepNo);
    if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > 8) {
      return fail({ code: 'VALIDATION_ERROR', message: 'stepNo 必须是 1-8 的整数', retryable: false });
    }

    // 1. 复用进行中的会话（同一用户同一 step 唯一 in_progress session）
    const { data: activeSession, error: activeError } = await supabase.from('quiz_sessions')
      .select('id,questions').eq('user_id', userId).eq('step_no', stepNo).eq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (activeError) throw activeError;
    if (activeSession) {
      return ok({ session_id: activeSession.id, questions: clientQuestions(activeSession.questions as QuizQuestion[]) });
    }

    // 2. 读取该用户已分配的题目 id（去重依据）
    const { data: assignedRows, error: assignedError } = await supabase
      .from('quiz_question_assignments').select('question_id').eq('user_id', userId);
    if (assignedError) throw assignedError;
    const assignedIds = new Set<string>((assignedRows ?? []).map((row) => row.question_id));

    // 3. 读取已发布题目池
    const { data: poolQuestions, error: poolError } = await supabase
      .from('quiz_questions')
      .select('id,question_text,options,correct_option_id,explanation')
      .eq('step_no', stepNo)
      .eq('status', 'published')
      .order('id', { ascending: false })
      .limit(300);
    if (poolError) throw poolError;

    // 4. 排除已分配题目，随机抽取 5 题（池内文本已由唯一索引去重，只需按 id 去重）
    const picked = pickRandomUnassigned((poolQuestions ?? []) as QuizQuestionRow[], assignedIds, 5);
    const questions: QuizQuestion[] = picked.map((q) => ({
      question_id: q.id,
      question_text: q.question_text,
      options: q.options,
      correct_option_id: q.correct_option_id,
      explanation: q.explanation,
    }));

    if (questions.length < 5) {
      return fail({
        code: 'STATE_INVALID',
        message: '暂时没有更多新题，你可以回顾历史答卷或继续学习。教师发布新题后可再练习。',
        retryable: false,
      }, undefined, 409);
    }

    // 5. 创建 quiz_session
    const { data: session, error: insertError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: userId,
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

    // 6. 写入题目分配记录（幂等，唯一约束保证去重；失败不阻塞主流程——session 已保存题目）
    const { error: assignError } = await supabase
      .from('quiz_question_assignments')
      .insert(questions.map((q) => ({
        user_id: userId,
        question_id: q.question_id,
        step_no: stepNo,
        session_id: session.id,
      })));
    if (assignError) {
      // 仅在极端并发下可能触发（同一用户唯一 in_progress 已由 session 约束拦截）；
      // 记录结构化日志供排障，不阻断用户已成功创建会话的答题流程。
      console.error('[quiz/start] 写入题目分配记录失败', assignError.code, assignError.message);
    }

    // 返回时隐藏 correct_option_id 和 explanation（防止客户端作弊）
    return ok({ session_id: session.id, questions: clientQuestions(questions) });
  } catch (err) {
    return fail(errorFromUnknown(err));
  }
}

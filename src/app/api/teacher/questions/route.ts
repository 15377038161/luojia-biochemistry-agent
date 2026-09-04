import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { generateQuizQuestions } from '@/lib/coze-workflows';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';

type QuestionStatus = 'draft' | 'published' | 'archived';
type QuestionDimension = 'knowledge' | 'detail' | 'data';

interface QuestionUpdate {
  id?: string;
  stepNo?: number;
  dimension?: QuestionDimension;
  questionText?: string;
  options?: Array<{ id: string; text: string }>;
  correctOptionId?: string;
  explanation?: string;
  status?: QuestionStatus;
}

async function requireTeacher(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) throw Object.assign(new Error('请先登录。'), { status: 401, code: 'AUTH_REQUIRED' });
  if (!identity.user.capabilities.teacherWorkspace) throw Object.assign(new Error('只有教师可以维护题库。'), { status: 403, code: 'FORBIDDEN' });
  return identity;
}

function validStep(value: unknown): number | null {
  const stepNo = Number(value);
  return Number.isInteger(stepNo) && stepNo >= 1 && stepNo <= 8 ? stepNo : null;
}

function validateQuestion(input: QuestionUpdate) {
  if (!input.id || !validStep(input.stepNo) || !['knowledge', 'detail', 'data'].includes(String(input.dimension))) throw new Error('题目编号、步骤或维度无效。');
  if (!input.questionText?.trim() || input.questionText.trim().length < 8) throw new Error('题干至少需要8个字符。');
  if (!Array.isArray(input.options) || input.options.length !== 4) throw new Error('每道题必须有4个选项。');
  const ids = input.options.map((item) => item.id);
  if (new Set(ids).size !== 4 || ids.some((id) => !['A', 'B', 'C', 'D'].includes(id)) || input.options.some((item) => !item.text.trim())) throw new Error('选项必须是非空且唯一的A—D。');
  if (!input.correctOptionId || !ids.includes(input.correctOptionId)) throw new Error('正确答案必须对应一个有效选项。');
  if (!input.explanation?.trim() || input.explanation.trim().length < 30) throw new Error('解析至少需要30个字符，并说明原理与误区。');
  if (!input.status || !['draft', 'published', 'archived'].includes(input.status)) throw new Error('题目状态无效。');
}

export async function GET(request: NextRequest) {
  try {
    await requireTeacher(request);
    const stepNo = validStep(request.nextUrl.searchParams.get('stepNo'));
    if (!stepNo) return fail({ code: 'VALIDATION_ERROR', message: 'stepNo 必须为1—8。', retryable: false }, undefined, 400);
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('quiz_questions')
      .select('id,step_no,dimension,question_text,options,correct_option_id,explanation,status,updated_at')
      .eq('step_no', stepNo).neq('status', 'archived').order('updated_at', { ascending: false });
    if (error) throw error;
    return ok({ questions: data ?? [] });
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status === 401 || status === 403) return fail({ code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', message: error instanceof Error ? error.message : '无权访问。', retryable: false }, undefined, status);
    return fail(errorFromUnknown(error), undefined, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireTeacher(request);
    const body = await request.json() as { action?: string; stepNo?: unknown; count?: unknown };
    const stepNo = validStep(body.stepNo);
    if (!stepNo) return fail({ code: 'VALIDATION_ERROR', message: 'stepNo 必须为1—8。', retryable: false }, undefined, 400);
    const admin = getSupabaseAdminClient();
    if (body.action === 'publish') {
      const { error } = await admin.from('quiz_questions').update({ status: 'published', updated_at: new Date().toISOString() }).eq('step_no', stepNo).eq('status', 'draft');
      if (error) throw error;
      return ok({ published: true });
    }
    if (body.action !== 'generate') return fail({ code: 'VALIDATION_ERROR', message: '不支持的题库操作。', retryable: false }, undefined, 400);
    const count = Math.min(20, Math.max(5, Number(body.count) || 10));
    const generated = await generateQuizQuestions(stepNo, count);
    const { data: existing, error: existingError } = await admin.from('quiz_questions').select('question_text').eq('step_no', stepNo);
    if (existingError) throw existingError;
    const normalize = (value: string) => value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、,.!?]/g, '');
    const seen = new Set((existing ?? []).map((item) => normalize(String(item.question_text))));
    const rows: Array<Record<string, unknown>> = [];
    for (const item of generated.data) {
      const normalized = normalize(item.question_text);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      rows.push({
        id: item.question_id, step_no: stepNo,
        dimension: (['knowledge', 'detail', 'data'] as const)[rows.length % 3],
        question_text: item.question_text, options: item.options, correct_option_id: item.correct_option_id,
        explanation: item.explanation, status: 'draft' as const, created_by: identity.user.id, updated_at: new Date().toISOString(),
      });
    }
    if (!rows.length) return fail({ code: 'AI_OUTPUT_INVALID', message: 'AI生成的题目与现有题库重复，请重试。', retryable: true }, undefined, 422);
    const { data, error } = await admin.from('quiz_questions').insert(rows).select('id');
    if (error) throw error;
    return ok({ created: data?.length ?? 0 });
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status === 401 || status === 403) return fail({ code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', message: error instanceof Error ? error.message : '无权访问。', retryable: false }, undefined, status);
    return fail(errorFromUnknown(error), undefined, status);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const identity = await requireTeacher(request);
    const body = await request.json() as QuestionUpdate;
    validateQuestion(body);
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('quiz_questions').update({
      step_no: body.stepNo, dimension: body.dimension, question_text: body.questionText?.trim(), options: body.options,
      correct_option_id: body.correctOptionId, explanation: body.explanation?.trim(), status: body.status,
      updated_at: new Date().toISOString(),
    }).eq('id', body.id).select('id,status,updated_at').single();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    const status = Number((error as { status?: number }).status) || 500;
    if (status === 401 || status === 403) return fail({ code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', message: error instanceof Error ? error.message : '无权访问。', retryable: false }, undefined, status);
    if (error instanceof Error && /题目|题干|选项|答案|解析|状态/.test(error.message)) return fail({ code: 'VALIDATION_ERROR', message: error.message, retryable: false }, undefined, 400);
    return fail(errorFromUnknown(error), undefined, status);
  }
}

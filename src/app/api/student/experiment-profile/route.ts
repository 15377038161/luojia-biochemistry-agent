import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';

type SequenceSource = 'recommended' | 'accession' | 'pasted';
type CloningStrategy = 'recombination' | 'double_digest';

interface ProfileInput {
  sessionId?: string;
  targetGene?: string;
  sequenceSource?: SequenceSource;
  accession?: string;
  codingSequence?: string;
  cloningStrategy?: CloningStrategy;
}

function normalizeSequence(value: string): string {
  return value.replace(/[\s\d]/g, '').toUpperCase();
}

async function ownEditableSession(sessionId: string, userId: string) {
  const admin = getSupabaseAdminClient();
  const { data: session, error } = await admin.from('agent_sessions')
    .select('id,user_id,agent_role,current_step').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  if (!session || session.user_id !== userId || session.agent_role !== 'student') throw new Error('FORBIDDEN');
  return { admin, session };
}

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId') || '';
    if (!sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false });
    const { admin } = await ownEditableSession(sessionId, identity.user.id);
    const { data, error } = await admin.from('student_experiment_profiles').select('*').eq('session_id', sessionId).maybeSingle();
    if (error) throw error;
    return ok(data ?? {
      session_id: sessionId,
      target_gene: 'EGFP',
      sequence_source: 'recommended',
      accession: null,
      coding_sequence: null,
      cloning_strategy: 'recombination',
      design_snapshot: { sequence_length: 720, source_label: '课程推荐EGFP编码序列' },
    });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function PUT(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = await request.json() as ProfileInput;
    const sessionId = body.sessionId?.trim() || '';
    const source = body.sequenceSource;
    const strategy = body.cloningStrategy;
    const targetGene = body.targetGene?.trim() || '';
    if (!sessionId || !source || !['recommended', 'accession', 'pasted'].includes(source) || !strategy || !['recombination', 'double_digest'].includes(strategy)) {
      return fail({ code: 'VALIDATION_ERROR', message: '实验档案参数不完整。', retryable: false });
    }
    const { admin, session } = await ownEditableSession(sessionId, identity.user.id);
    const { count, error: attemptError } = await admin.from('step_attempts')
      .select('id', { count: 'exact', head: true }).eq('session_id', sessionId).eq('step_no', 1);
    if (attemptError) throw attemptError;
    if (Number(session.current_step) > 1 || (count ?? 0) > 0) {
      return fail({ code: 'STATE_INVALID', message: '步骤1提交后实验对象已锁定，不能更换目标基因。', retryable: false }, undefined, 409);
    }

    const accession = body.accession?.trim() || null;
    const sequence = body.codingSequence ? normalizeSequence(body.codingSequence) : null;
    const gene = source === 'recommended' ? 'EGFP' : targetGene;
    if (!gene || gene.length > 120) return fail({ code: 'VALIDATION_ERROR', message: '请填写有效的目标基因名称。', retryable: false });
    if (source === 'accession' && (!accession || accession.length > 80)) return fail({ code: 'VALIDATION_ERROR', message: '请填写有效的GenBank登录号。', retryable: false });
    if (source === 'pasted' && (!sequence || sequence.length < 30 || sequence.length > 200000 || !/^[ACGTN]+$/.test(sequence))) {
      return fail({ code: 'VALIDATION_ERROR', message: '编码序列只能包含A/C/G/T/N，长度应为30—200000 nt。', retryable: false });
    }
    const gcCount = sequence ? [...sequence].filter((base) => base === 'G' || base === 'C').length : 0;
    const designSnapshot = {
      sequence_length: sequence?.length ?? (source === 'recommended' ? 720 : null),
      gc_percent: sequence ? Math.round(gcCount / sequence.length * 1000) / 10 : null,
      source_label: source === 'recommended' ? '课程推荐EGFP编码序列' : source === 'accession' ? `GenBank ${accession}` : '学生提交编码序列',
      vector: 'pET-28a(+)',
      strategy,
      locked: false,
    };
    const { data, error } = await admin.from('student_experiment_profiles').upsert({
      session_id: sessionId,
      target_gene: gene,
      sequence_source: source,
      accession: source === 'accession' ? accession : null,
      coding_sequence: source === 'pasted' ? sequence : null,
      cloning_strategy: strategy,
      design_snapshot: designSnapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' }).select('*').single();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

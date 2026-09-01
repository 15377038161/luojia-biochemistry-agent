import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGradeSummary, loadGradingFacts } from '@/lib/services/grading';

export interface AppealRecord {
  requestId: string;
  sessionId: string;
  reportId: string;
  status: 'pending' | 'resolved';
  reason: string;
  resolution: string | null;
  decision: 'confirm' | 'adjust' | 'comment_only' | null;
  adjustedScore: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

function parseMetadata(row: { metadata: unknown } | null): Record<string, unknown> {
  const metadata = row?.metadata;
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
}

export function appealRecordFromRow(row: { metadata: unknown; content: unknown; created_at: string }): AppealRecord | null {
  const metadata = parseMetadata(row);
  if (typeof metadata.request_id !== 'string' || typeof metadata.report_id !== 'string') return null;
  const status = metadata.status === 'resolved' ? 'resolved' : 'pending';
  return {
    requestId: metadata.request_id,
    sessionId: typeof metadata.session_id === 'string' ? metadata.session_id : '',
    reportId: metadata.report_id,
    status,
    reason: typeof metadata.reason === 'string' ? metadata.reason : String(row.content ?? ''),
    resolution: typeof metadata.resolution === 'string' ? metadata.resolution : null,
    decision: metadata.decision === 'confirm' || metadata.decision === 'adjust' || metadata.decision === 'comment_only' ? metadata.decision : null,
    adjustedScore: typeof metadata.adjusted_score === 'number' ? metadata.adjusted_score : null,
    createdAt: typeof metadata.created_at === 'string' ? metadata.created_at : row.created_at,
    resolvedAt: typeof metadata.resolved_at === 'string' ? metadata.resolved_at : null,
  };
}

async function findAppealMessageByRequestId(admin: SupabaseClient, requestId: string): Promise<{ id: string; session_id: string; metadata: Record<string, unknown>; created_at: string } | null> {
  const { data, error } = await admin
    .from('agent_messages')
    .select('id,session_id,metadata,created_at')
    .eq('kind', 'grade_review_request')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const row = (data ?? []).find((item) => parseMetadata(item).request_id === requestId);
  return row ?? null;
}

export async function submitAppeal(
  admin: SupabaseClient,
  input: { sessionId: string; userId: string; reportId: string; reason: string },
): Promise<{ requestId: string; createdAt: string }> {
  const pending = await pendingAppealForSession(admin, input.sessionId);
  if (pending) {
    throw Object.assign(new Error('该报告已有待处理的申诉，请等待教师处理。'), { code: 'STATE_INVALID', statusCode: 409 });
  }
  const requestId = randomUUID();
  const createdAt = new Date().toISOString();
  const { error: messageError } = await admin
    .from('agent_messages')
    .insert({
      session_id: input.sessionId,
      role: 'user',
      kind: 'grade_review_request',
      step_no: null,
      content: input.reason,
      metadata: {
        request_id: requestId,
        report_id: input.reportId,
        session_id: input.sessionId,
        reason: input.reason,
        status: 'pending',
        created_at: createdAt,
      },
    });
  if (messageError) throw messageError;
  const { error: eventError } = await admin.from('event_logs').insert({
    user_id: input.userId,
    event_type: 'grade_review_requested',
    request_id: requestId,
    payload: { session_id: input.sessionId, report_id: input.reportId, reason: input.reason },
  });
  if (eventError) throw eventError;
  return { requestId, createdAt };
}

export async function pendingAppealForSession(admin: SupabaseClient, sessionId: string): Promise<AppealRecord | null> {
  const { data, error } = await admin
    .from('agent_messages')
    .select('metadata,content,created_at')
    .eq('session_id', sessionId)
    .in('kind', ['grade_review_request', 'grade_review_resolution'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  const requests = new Map<string, AppealRecord>();
  for (const row of data ?? []) {
    const record = appealRecordFromRow(row);
    if (record) requests.set(record.requestId, record);
  }
  const latest = [...requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  return latest;
}

export interface AppealListItem extends AppealRecord {
  studentName: string;
  studentNo: string;
  processScore: number | null;
  contributionPoints: number | null;
  gradeStatus: string | null;
}

export async function appealStateForSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const appeal = await pendingAppealForSession(admin, sessionId);
  if (!appeal) return null;
  return {
    id: appeal.requestId,
    status: appeal.status,
    reason: appeal.reason,
    resolution: appeal.resolution,
    createdAt: appeal.createdAt,
  };
}

export async function listAppeals(admin: SupabaseClient): Promise<AppealListItem[]> {
  const { data: rows, error } = await admin
    .from('agent_messages')
    .select('kind,metadata,content,created_at,session_id')
    .in('kind', ['grade_review_request', 'grade_review_resolution'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  const requests = new Map<string, AppealRecord & { sessionId: string }>();
  for (const row of rows ?? []) {
    const record = appealRecordFromRow(row);
    if (!record) continue;
    if (row.kind === 'grade_review_request') {
      requests.set(record.requestId, { ...record, sessionId: row.session_id });
    } else {
      const existing = requests.get(record.requestId);
      if (existing) {
        existing.status = 'resolved';
        existing.resolution = record.resolution ?? record.reason;
        existing.decision = record.decision;
        existing.adjustedScore = record.adjustedScore;
        existing.resolvedAt = record.resolvedAt;
      }
    }
  }
  const items = [...requests.values()];
  if (items.length === 0) return [];

  const sessionIds = [...new Set(items.map((item) => item.sessionId))].filter(Boolean);
  const { data: sessions, error: sessionError } = await admin
    .from('agent_sessions')
    .select('id,user_id')
    .in('id', sessionIds)
    .eq('agent_role', 'student');
  if (sessionError) throw sessionError;
  const sessionUser = new Map((sessions ?? []).map((session) => [session.id, session.user_id]));

  const userIds = [...new Set([...sessionUser.values()])].filter(Boolean);
  const { data: profiles, error: profileError } = userIds.length
    ? await admin.from('profiles').select('id,display_name,student_no').in('id', userIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const reportIds = [...new Set(items.map((item) => item.reportId))];
  const { data: reports, error: reportError } = reportIds.length
    ? await admin.from('learning_reports').select('id,session_id,content').in('id', reportIds)
    : { data: [], error: null };
  if (reportError) throw reportError;
  const reportById = new Map((reports ?? []).map((report) => [report.id, report]));

  return items
    .filter((item) => sessionUser.has(item.sessionId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const userId = sessionUser.get(item.sessionId) ?? '';
      const profile = userId ? profileById.get(userId) : undefined;
      const report = reportById.get(item.reportId);
      const gradingRaw = report && typeof report.content === 'object' && report.content !== null
        ? ((report.content as Record<string, unknown>).grading as Record<string, unknown> | undefined)
        : undefined;
      return {
        ...item,
        studentName: profile?.display_name ?? '学生',
        studentNo: profile?.student_no ?? '',
        processScore: typeof gradingRaw?.process_score === 'number' ? gradingRaw.process_score : null,
        contributionPoints: typeof gradingRaw?.contribution_points === 'number' ? gradingRaw.contribution_points : null,
        gradeStatus: typeof gradingRaw?.status === 'string' ? gradingRaw.status : null,
      };
    });
}

export interface ResolveAppealInput {
  requestId: string;
  teacherId: string;
  resolution: string;
  accepted: boolean;
  overrideScore: number | null;
}

export async function resolveAppeal(admin: SupabaseClient, input: ResolveAppealInput): Promise<{ id: string; status: 'resolved'; reason: string; resolution: string }> {
  const requestRow = await findAppealMessageByRequestId(admin, input.requestId);
  if (!requestRow) {
    throw Object.assign(new Error('申诉记录不存在。'), { code: 'RESOURCE_MISSING', statusCode: 404 });
  }
  const metadata = requestRow.metadata;
  if (metadata.status === 'resolved') {
    throw Object.assign(new Error('该申诉已处理，不能重复处理。'), { code: 'STATE_INVALID', statusCode: 409 });
  }
  const sessionId = requestRow.session_id;
  const reportId = String(metadata.report_id ?? '');
  const reason = typeof metadata.reason === 'string' ? metadata.reason : '';

  const decision: 'confirm' | 'adjust' | 'comment_only' = input.overrideScore !== null
    ? 'adjust'
    : input.accepted
      ? 'confirm'
      : 'comment_only';

  const facts = await loadGradingFacts(admin, sessionId);
  const summary = computeGradeSummary(facts);
  const processScore = decision === 'adjust' && input.overrideScore !== null ? input.overrideScore : summary.process_score;
  const contributionPoints = Number((processScore * 0.1).toFixed(2));
  const resolvedAt = new Date().toISOString();
  const finalization = { status: 'final' as const, finalizedAt: resolvedAt, finalizedBy: input.teacherId };

  const { data: currentReport, error: reportError } = await admin
    .from('learning_reports')
    .select('id,content,rendered_markdown,workflow_run_id,version')
    .eq('id', reportId)
    .maybeSingle();
  if (reportError) throw reportError;

  const previousContent = currentReport && typeof currentReport.content === 'object' && currentReport.content !== null
    ? (currentReport.content as Record<string, unknown>)
    : {};
  const grading: Record<string, unknown> = {
    total_score: summary.total_score,
    process_score: processScore,
    contribution_points: contributionPoints,
    status: 'final',
    dimensions: summary.dimensions.map((item) => ({ dimension: item.label, score: item.score, max: item.max })),
    step_reports: summary.step_reports,
    calculated_at: summary.calculated_at,
    finalized_at: resolvedAt,
    finalized_by: input.teacherId,
  };
  const nextContent: Record<string, unknown> = { ...previousContent, grading };

  const { data: latestReport, error: latestError } = await admin
    .from('learning_reports')
    .select('version')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const nextVersion = Number(latestReport?.version ?? 0) + 1;
  const { data: newReport, error: insertReportError } = await admin
    .from('learning_reports')
    .insert({
      session_id: sessionId,
      version: nextVersion,
      content: nextContent,
      rendered_markdown: currentReport?.rendered_markdown ?? '',
      workflow_run_id: currentReport?.workflow_run_id ?? null,
    })
    .select('id')
    .single();
  if (insertReportError) throw insertReportError;

  const { error: reviewError } = await admin.from('teacher_reviews').insert({
    evaluation_id: null,
    report_id: reportId || newReport.id,
    teacher_id: input.teacherId,
    decision,
    comment: input.resolution,
  });
  if (reviewError) throw reviewError;

  const { error: resolutionMessageError } = await admin
    .from('agent_messages')
    .insert({
      session_id: sessionId,
      role: 'assistant',
      kind: 'grade_review_resolution',
      step_no: null,
      content: input.resolution,
      metadata: {
        request_id: input.requestId,
        report_id: reportId,
        session_id: sessionId,
        status: 'resolved',
        decision,
        adjusted_score: decision === 'adjust' ? processScore : null,
        resolution: input.resolution,
        resolved_at: resolvedAt,
      },
    });
  if (resolutionMessageError) throw resolutionMessageError;

  const { error: updateRequestError } = await admin
    .from('agent_messages')
    .update({ metadata: { ...metadata, status: 'resolved', resolved_at: resolvedAt, decision } })
    .eq('id', requestRow.id);
  if (updateRequestError) throw updateRequestError;

  const { error: eventError } = await admin.from('event_logs').insert({
    user_id: input.teacherId,
    event_type: 'grade_review_resolved',
    request_id: input.requestId,
    payload: {
      session_id: sessionId,
      report_id: reportId,
      new_report_id: newReport.id,
      decision,
      adjusted_score: decision === 'adjust' ? processScore : null,
    },
  });
  if (eventError) throw eventError;

  return { id: input.requestId, status: 'resolved', reason, resolution: input.resolution };
}

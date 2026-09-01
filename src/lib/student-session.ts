import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMessage, StepProgress, StudentSessionView, TextEvaluation } from '@/domain/agent';

interface SessionRow {
  id: string;
  current_step: number | null;
  completed_at: string | null;
}

export async function loadStudentSessionView(
  supabase: SupabaseClient,
  session: SessionRow,
  studentName: string,
): Promise<StudentSessionView> {
  const [{ data: states, error: statesError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase.from('step_states').select('step_no,status,attempt_count,final_summary').eq('session_id', session.id).order('step_no'),
    supabase.from('agent_messages').select('id,role,kind,step_no,content,metadata,created_at').eq('session_id', session.id).order('created_at'),
  ]);
  if (statesError) throw statesError;
  if (messagesError) throw messagesError;

  return {
    sessionId: session.id,
    studentName,
    currentStep: session.current_step || 1,
    completed: Boolean(session.completed_at),
    steps: (states || []).map((item): StepProgress => ({
      stepId: item.step_no,
      status: item.status,
      attemptCount: item.attempt_count,
      finalSummary: item.final_summary || undefined,
    })),
    messages: (messages || []).map((item): AgentMessage => ({
      id: item.id,
      role: item.role,
      kind: item.kind,
      content: item.content,
      stepId: item.step_no,
      createdAt: item.created_at,
      evaluation: (item.metadata?.evaluation as TextEvaluation | undefined),
      mediaUrl: item.metadata?.mediaUrl as string | undefined,
    })),
  };
}

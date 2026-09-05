export interface QuizOption { id: string; text: string }
export interface PublicQuizQuestion { question_id: string; question_text: string; options: QuizOption[] }
export interface QuizResult { question_id: string; user_answer: string; correct_answer: string; is_correct: boolean; explanation: string }
export interface QuizSession {
  session_id: string;
  questions: PublicQuizQuestion[];
  answers: Record<string, string>;
  status: 'in_progress' | 'submitted' | 'graded';
  results: QuizResult[] | null;
}
export interface QuizSummary { session_id: string; created_at: string; total: number; correct: number }
export interface QuizHistory { items: QuizSummary[]; nextPage: number | null; activeId: string | null; hasCompleted: boolean }

// White-list fields; raw question JSON and results never escape before grading.
export function publicQuizSession(row: { id: string; questions: PublicQuizQuestion[]; answers: Record<string, string> | null; status: QuizSession['status']; results: QuizResult[] | null }): QuizSession {
  return { session_id: row.id, questions: row.questions.map(q => ({ question_id: q.question_id, question_text: q.question_text, options: q.options.map(o => ({ id: o.id, text: o.text })) })), answers: row.answers || {}, status: row.status, results: row.status === 'graded' ? row.results : null };
}

export function validateQuizAnswers(questions: PublicQuizQuestion[], answers: unknown, complete = false): answers is Record<string, string> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return false;
  const entries = Object.entries(answers);
  return (!complete || entries.length === questions.length) && entries.every(([id, value]) => questions.some(q => q.question_id === id && q.options.some(o => o.id === value)));
}

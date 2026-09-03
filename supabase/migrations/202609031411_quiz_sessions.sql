-- 知识点检验会话表
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_no integer NOT NULL CHECK (step_no BETWEEN 1 AND 8),
  
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- questions 结构: [{ question_id, question_text, options: [{id, text}], correct_option_id, explanation }]
  
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- answers 结构: { question_id: selected_option_id }
  
  results jsonb,
  -- results 结构: { score, total, details: [{ question_id, correct, selected, correct_answer, explanation }] }
  -- 仅在批改后填充
  
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  
  UNIQUE(user_id, step_no, created_at)
);

-- 索引
CREATE INDEX idx_quiz_sessions_user_step ON quiz_sessions(user_id, step_no);
CREATE INDEX idx_quiz_sessions_status ON quiz_sessions(status) WHERE status = 'submitted';

-- RLS 策略
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的会话
CREATE POLICY quiz_sessions_own_read ON quiz_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY quiz_sessions_own_insert ON quiz_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY quiz_sessions_own_update ON quiz_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- 注释
COMMENT ON TABLE quiz_sessions IS '知识点检验会话：题目、作答、批改结果';
COMMENT ON COLUMN quiz_sessions.questions IS '题目池（AI生成，包含题干/选项/正确答案/解析）';
COMMENT ON COLUMN quiz_sessions.answers IS '用户作答记录（question_id -> selected_option_id）';
COMMENT ON COLUMN quiz_sessions.results IS '批改结果（分数/明细/解析），仅在 status=graded 后填充';

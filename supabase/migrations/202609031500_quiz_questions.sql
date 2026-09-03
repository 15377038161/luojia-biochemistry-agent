-- 知识点检验题目池（预生成，避免现场 AI 出题慢）
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_no int NOT NULL CHECK (step_no BETWEEN 1 AND 8),
  dimension text NOT NULL CHECK (dimension IN ('knowledge', 'detail', 'data')), -- 知识点/实验细节/数据解读
  question_text text NOT NULL,
  options jsonb NOT NULL, -- [{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}]
  correct_option_id text NOT NULL CHECK (correct_option_id IN ('A','B','C','D')),
  explanation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_step ON quiz_questions(step_no);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_dimension ON quiz_questions(step_no, dimension);

COMMENT ON TABLE quiz_questions IS '知识点检验题目池（预生成，避免现场 AI 出题慢）';
COMMENT ON COLUMN quiz_questions.dimension IS '题目维度：knowledge=知识点, detail=实验细节, data=数据解读';

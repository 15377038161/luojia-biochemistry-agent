-- Add student_id as alias to user_id for backward compatibility with PostgREST schema cache
-- This is a virtual column that doesn't store data, just maps to user_id
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS student_id uuid GENERATED ALWAYS AS (user_id) STORED;

-- Add comment explaining this is for compatibility
COMMENT ON COLUMN agent_sessions.student_id IS 'Virtual column mapping to user_id for PostgREST schema cache compatibility';

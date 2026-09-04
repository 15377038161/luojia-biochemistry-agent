-- 删除不符合教学质量要求的占位选项；步骤3–8在首次开始测验时由AI生成、校验并入池。
delete from public.quiz_questions
where step_no between 3 and 8
  and options @> '[{"id":"A","text":"正确选项"}]'::jsonb;

CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"step_no" smallint,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experiment_id" uuid,
	"class_id" uuid,
	"agent_role" text NOT NULL,
	"current_step" smallint,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"term" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"total_score" smallint NOT NULL,
	"result" jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"workflow_run_id" text,
	"requires_teacher_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"event_type" text NOT NULL,
	"request_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "experiment_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"step_no" smallint NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"context" text NOT NULL,
	"goal" text NOT NULL,
	"content" jsonb NOT NULL,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"source_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_uid" text NOT NULL,
	"fid" text,
	"raw_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "image_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"step_no" smallint NOT NULL,
	"prompt" text NOT NULL,
	"image_path" text NOT NULL,
	"labels" jsonb NOT NULL,
	"safety_critical" boolean DEFAULT false NOT NULL,
	"source_ref" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "image_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "instrument_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"purpose" text NOT NULL,
	"safety_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applicable_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_path" text,
	"source_ref" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instrument_catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"step_no" smallint,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_file" text NOT NULL,
	"source_location" text,
	"source_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"teacher_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"rendered_markdown" text NOT NULL,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_no" smallint NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"evaluation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"student_no" text,
	"major_name" text,
	"grade_name" text,
	"class_name" text,
	"academic_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_no" integer NOT NULL,
	"dimension" text NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_id" text NOT NULL,
	"explanation" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"step_no" integer NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"results" jsonb,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rubric_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"code" text NOT NULL,
	"dimension" text NOT NULL,
	"label" text NOT NULL,
	"weight" smallint NOT NULL,
	"required_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hints" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rubric_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"pass_score" smallint DEFAULT 80 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"source_ref" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rubrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "step_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_no" smallint NOT NULL,
	"version_no" smallint NOT NULL,
	"request_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "step_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "step_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"step_no" smallint NOT NULL,
	"status" text NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"final_summary" text,
	"passed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "step_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_experiment_profiles" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"target_gene" text DEFAULT 'EGFP' NOT NULL,
	"sequence_source" text DEFAULT 'recommended' NOT NULL,
	"accession" text,
	"coding_sequence" text,
	"cloning_strategy" text DEFAULT 'recombination' NOT NULL,
	"design_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_experiment_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"destination" text DEFAULT 'chaoxing_form_3513491' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teacher_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid,
	"report_id" uuid,
	"teacher_id" uuid NOT NULL,
	"decision" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teacher_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_attempt_id_step_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "step_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_steps" ADD CONSTRAINT "experiment_steps_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_questions" ADD CONSTRAINT "image_questions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_catalog" ADD CONSTRAINT "instrument_catalog_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_reports" ADD CONSTRAINT "learning_reports_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_submissions" ADD CONSTRAINT "media_submissions_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_items" ADD CONSTRAINT "rubric_items_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_step_id_experiment_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "experiment_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_attempts" ADD CONSTRAINT "step_attempts_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_states" ADD CONSTRAINT "step_states_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_experiment_profiles" ADD CONSTRAINT "student_experiment_profiles_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_reviews" ADD CONSTRAINT "teacher_reviews_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_reviews" ADD CONSTRAINT "teacher_reviews_report_id_learning_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "learning_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_reviews" ADD CONSTRAINT "teacher_reviews_teacher_id_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_session_idx" ON "agent_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_student_session_idx" ON "agent_sessions" USING btree ("user_id","experiment_id") WHERE "agent_sessions"."agent_role" = 'student' AND "agent_sessions"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_sessions_class_idx" ON "agent_sessions" USING btree ("class_id","agent_role","current_step");--> statement-breakpoint
CREATE INDEX "agent_sessions_user_id_idx" ON "agent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_experiment_id_idx" ON "agent_sessions" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_request_id_key" ON "ai_jobs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_course_id_name_term_key" ON "classes" USING btree ("course_id","name","term");--> statement-breakpoint
CREATE INDEX "classes_course_id_idx" ON "classes" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_experiment_id_version_key" ON "content_versions" USING btree ("experiment_id","version");--> statement-breakpoint
CREATE INDEX "content_versions_experiment_id_idx" ON "content_versions" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_key" ON "courses" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_class_id_user_id_key" ON "enrollments" USING btree ("class_id","user_id");--> statement-breakpoint
CREATE INDEX "enrollments_class_id_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "enrollments_user_id_idx" ON "enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evaluations_attempt_id_idx" ON "evaluations" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "event_logs_user_id_idx" ON "event_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_logs_event_type_idx" ON "event_logs" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_steps_experiment_id_step_no_key" ON "experiment_steps" USING btree ("experiment_id","step_no");--> statement-breakpoint
CREATE INDEX "experiment_steps_experiment_id_idx" ON "experiment_steps" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_course_id_slug_version_key" ON "experiments" USING btree ("course_id","slug","version");--> statement-breakpoint
CREATE INDEX "experiments_course_id_idx" ON "experiments" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_external_uid_fid_key" ON "external_identities" USING btree ("provider","external_uid","fid");--> statement-breakpoint
CREATE INDEX "image_questions_experiment_id_idx" ON "image_questions" USING btree ("experiment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_catalog_experiment_id_name_key" ON "instrument_catalog" USING btree ("experiment_id","name");--> statement-breakpoint
CREATE INDEX "instrument_catalog_experiment_id_idx" ON "instrument_catalog" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_step_idx" ON "knowledge_chunks" USING btree ("experiment_id","step_no","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_reports_session_id_version_key" ON "learning_reports" USING btree ("session_id","version");--> statement-breakpoint
CREATE INDEX "learning_reports_session_id_idx" ON "learning_reports" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_submissions_session_id_sha256_key" ON "media_submissions" USING btree ("session_id","sha256");--> statement-breakpoint
CREATE INDEX "media_submissions_session_id_idx" ON "media_submissions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "profiles_academic_dimensions_idx" ON "profiles" USING btree ("major_name","grade_name","class_name");--> statement-breakpoint
CREATE INDEX "idx_quiz_questions_step" ON "quiz_questions" USING btree ("step_no");--> statement-breakpoint
CREATE INDEX "idx_quiz_questions_dimension" ON "quiz_questions" USING btree ("step_no","dimension");--> statement-breakpoint
CREATE INDEX "idx_quiz_questions_step_status_updated" ON "quiz_questions" USING btree ("step_no","status","updated_at" desc);--> statement-breakpoint
CREATE INDEX "idx_quiz_questions_created_by" ON "quiz_questions" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_step_text_unique_idx" ON "quiz_questions" USING btree ("step_no",md5(lower("question_text")));--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sessions_user_id_step_no_created_at_key" ON "quiz_sessions" USING btree ("user_id","step_no","created_at");--> statement-breakpoint
CREATE INDEX "idx_quiz_sessions_user_step" ON "quiz_sessions" USING btree ("user_id","step_no");--> statement-breakpoint
CREATE INDEX "idx_quiz_sessions_status" ON "quiz_sessions" USING btree ("status") WHERE "quiz_sessions"."status" = 'submitted';--> statement-breakpoint
CREATE UNIQUE INDEX "one_in_progress_quiz_per_student_step_idx" ON "quiz_sessions" USING btree ("user_id","step_no") WHERE "quiz_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_items_rubric_id_code_key" ON "rubric_items" USING btree ("rubric_id","code");--> statement-breakpoint
CREATE INDEX "rubric_items_rubric_id_idx" ON "rubric_items" USING btree ("rubric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rubrics_step_id_version_key" ON "rubrics" USING btree ("step_id","version");--> statement-breakpoint
CREATE INDEX "rubrics_step_id_idx" ON "rubrics" USING btree ("step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_request_id_key" ON "step_attempts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_session_id_step_no_version_no_key" ON "step_attempts" USING btree ("session_id","step_no","version_no");--> statement-breakpoint
CREATE INDEX "step_attempts_session_id_idx" ON "step_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "step_states_session_id_step_no_key" ON "step_states" USING btree ("session_id","step_no");--> statement-breakpoint
CREATE INDEX "step_states_session_id_idx" ON "step_states" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_outbox_event_id_key" ON "sync_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sync_outbox_worker_idx" ON "sync_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "teacher_reviews_evaluation_id_idx" ON "teacher_reviews" USING btree ("evaluation_id");--> statement-breakpoint
CREATE INDEX "teacher_reviews_teacher_id_idx" ON "teacher_reviews" USING btree ("teacher_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "is_authorized_teacher"(target_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  select exists (
    select 1 from enrollments e
    where e.class_id = target_class and e.user_id = auth.uid()
      and e.role in ('teacher', 'content_admin')
  );
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION "is_teacher_user"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  select exists (
    select 1 from enrollments e
    where e.user_id = auth.uid()
      and e.role in ('teacher', 'content_admin')
  );
$$;

--> statement-breakpoint
CREATE POLICY "message_session_access" ON "agent_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "agent_messages"."session_id"
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "message_owner_insert" ON "agent_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "agent_messages"."session_id" AND s.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "session_owner_read" ON "agent_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("agent_sessions"."user_id" = (SELECT auth.uid()) OR (SELECT is_authorized_teacher("agent_sessions"."class_id")));--> statement-breakpoint
CREATE POLICY "session_owner_insert" ON "agent_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("agent_sessions"."user_id" = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY "session_owner_update" ON "agent_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("agent_sessions"."user_id" = (SELECT auth.uid())) WITH CHECK ("agent_sessions"."user_id" = (SELECT auth.uid()));--> statement-breakpoint
CREATE POLICY "class_enrolled_read" ON "classes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id = "classes"."id" AND e.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "content_versions_teacher_read" ON "content_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        WHERE x.id = "content_versions"."experiment_id" AND (SELECT is_authorized_teacher(c.id))));--> statement-breakpoint
CREATE POLICY "course_authenticated_read" ON "courses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("courses"."active" = true);--> statement-breakpoint
CREATE POLICY "enrollment_self_or_teacher_read" ON "enrollments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("enrollments"."user_id" = (SELECT auth.uid()) OR (SELECT is_authorized_teacher("enrollments"."class_id")));--> statement-breakpoint
CREATE POLICY "evaluation_session_access" ON "evaluations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM step_attempts a JOIN agent_sessions s ON s.id = a.session_id
        WHERE a.id = "evaluations"."attempt_id" AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "step_enrolled_read" ON "experiment_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id
        WHERE x.id = "experiment_steps"."experiment_id" AND e.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "experiment_enrolled_read" ON "experiments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM classes c JOIN enrollments e ON e.class_id = c.id
        WHERE c.course_id = "experiments"."course_id" AND e.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "image_question_enrolled_read" ON "image_questions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id WHERE x.id = "image_questions"."experiment_id" AND e.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "instrument_enrolled_read" ON "instrument_catalog" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id WHERE x.id = "instrument_catalog"."experiment_id" AND e.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "knowledge_enrolled_read" ON "knowledge_chunks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        WHERE x.id = "knowledge_chunks"."experiment_id" AND (SELECT is_authorized_teacher(c.id))));--> statement-breakpoint
CREATE POLICY "report_session_access" ON "learning_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "learning_reports"."session_id"
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "report_owner_insert" ON "learning_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "learning_reports"."session_id" AND s.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "media_session_access" ON "media_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "media_submissions"."session_id"
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "media_owner_insert" ON "media_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "media_submissions"."session_id" AND s.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "profiles_self_read" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "profiles"."id");--> statement-breakpoint
CREATE POLICY "profiles_teacher_read" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM enrollments target JOIN enrollments viewer ON viewer.class_id = target.class_id
        WHERE target.user_id = "profiles"."id" AND viewer.user_id = (SELECT auth.uid())
          AND viewer.role IN ('teacher','content_admin')));--> statement-breakpoint
CREATE POLICY "quiz_sessions_own_read" ON "quiz_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "quiz_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "quiz_sessions_own_insert" ON "quiz_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "quiz_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "quiz_sessions_own_update" ON "quiz_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT auth.uid()) = "quiz_sessions"."user_id") WITH CHECK ((SELECT auth.uid()) = "quiz_sessions"."user_id");--> statement-breakpoint
CREATE POLICY "quiz_questions_published_read" ON "quiz_questions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("quiz_questions"."status" = 'published');--> statement-breakpoint
CREATE POLICY "quiz_questions_teacher_read" ON "quiz_questions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT is_teacher_user()));--> statement-breakpoint
CREATE POLICY "quiz_questions_teacher_insert" ON "quiz_questions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT is_teacher_user()));--> statement-breakpoint
CREATE POLICY "quiz_questions_teacher_update" ON "quiz_questions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((SELECT is_teacher_user()));--> statement-breakpoint
CREATE POLICY "quiz_questions_teacher_delete" ON "quiz_questions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((SELECT is_teacher_user()));--> statement-breakpoint
CREATE POLICY "rubric_item_enrolled_read" ON "rubric_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM rubrics r JOIN experiment_steps s ON s.id = r.step_id
        JOIN experiments x ON x.id = s.experiment_id JOIN classes c ON c.course_id = x.course_id
        WHERE r.id = "rubric_items"."rubric_id" AND (SELECT is_authorized_teacher(c.id))));--> statement-breakpoint
CREATE POLICY "rubric_enrolled_read" ON "rubrics" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM experiment_steps s JOIN experiments x ON x.id = s.experiment_id
        JOIN classes c ON c.course_id = x.course_id
        WHERE s.id = "rubrics"."step_id" AND (SELECT is_authorized_teacher(c.id))));--> statement-breakpoint
CREATE POLICY "attempt_session_access" ON "step_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "step_attempts"."session_id"
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "step_state_session_access" ON "step_states" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "step_states"."session_id"
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id)))));--> statement-breakpoint
CREATE POLICY "student_experiment_profile_owner_read" ON "student_experiment_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "student_experiment_profiles"."session_id"
        AND s.user_id = (SELECT auth.uid()) AND s.agent_role = 'student'));--> statement-breakpoint
CREATE POLICY "student_experiment_profile_teacher_read" ON "student_experiment_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = "student_experiment_profiles"."session_id"
        AND s.agent_role = 'student' AND (SELECT is_authorized_teacher(s.class_id))));--> statement-breakpoint
CREATE POLICY "review_teacher_read" ON "teacher_reviews" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("teacher_reviews"."teacher_id" = (SELECT auth.uid()) OR EXISTS(
        SELECT 1 FROM evaluations v JOIN step_attempts a ON a.id = v.attempt_id
        JOIN agent_sessions s ON s.id = a.session_id
        WHERE v.id = "teacher_reviews"."evaluation_id" AND s.user_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "review_teacher_insert" ON "teacher_reviews" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("teacher_reviews"."teacher_id" = (SELECT auth.uid()) AND (
        "teacher_reviews"."evaluation_id" IS NULL OR EXISTS(
          SELECT 1 FROM evaluations v JOIN step_attempts a ON a.id = v.attempt_id
          JOIN agent_sessions s ON s.id = a.session_id
          WHERE v.id = "teacher_reviews"."evaluation_id" AND (SELECT is_authorized_teacher(s.class_id)))));
--> statement-breakpoint
INSERT INTO "courses" ("id","code","name") VALUES
  ('10000000-0000-4000-8000-000000000001','BIOCHEM-EGFP','生物化学实验')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "classes" ("id","course_id","name","term") VALUES
  ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','演示班级','2026')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "experiments" ("id","course_id","slug","title","version","status") VALUES
  ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','egfp-expression-purification','EGFP表达与纯化文字实验',1,'published')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "start_or_resume_student_session"()
RETURNS "agent_sessions"
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  result agent_sessions;
  viewer uuid := auth.uid();
  step_no integer;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into profiles(id, display_name, role)
  values (viewer, coalesce(auth.jwt()->'user_metadata'->>'full_name', '学生'), 'student')
  on conflict (id) do nothing;
  insert into enrollments(class_id, user_id, role)
  values ('10000000-0000-4000-8000-000000000002', viewer, 'student')
  on conflict (class_id, user_id) do nothing;
  select * into result from agent_sessions
  where user_id = viewer and experiment_id = '10000000-0000-4000-8000-000000000003'
    and agent_role = 'student' and completed_at is null
  order by created_at desc limit 1;
  if result.id is null then
    insert into agent_sessions(user_id, experiment_id, class_id, agent_role, current_step)
    values (viewer, '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'student', 1)
    returning * into result;
    for step_no in 1..8 loop
      insert into step_states(session_id, step_no, status)
      values (result.id, step_no, case when step_no = 1 then 'active' else 'locked' end);
    end loop;
    insert into agent_messages(session_id, role, kind, step_no, content)
    values (result.id, 'assistant', 'navigation', 1,
      '欢迎来到EGFP表达与纯化文字实验。我会通过对话陪你走完八个步骤。先从目标基因与引物设计开始，请用自己的话说明你会怎样获取EGFP序列并设计引物。');
  end if;
  return result;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "record_text_evaluation"(
  target_session uuid,
  target_step smallint,
  request_key uuid,
  student_answer text,
  evaluation_result jsonb,
  prompt_version_value text,
  workflow_run_value text default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  viewer uuid := auth.uid();
  session_row agent_sessions;
  state_row step_states;
  new_attempt_id uuid;
  new_evaluation_id uuid;
  next_step smallint;
  decision_value text;
  score_value integer;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into session_row from agent_sessions where id = target_session for update;
  if session_row.user_id is distinct from viewer then raise exception 'FORBIDDEN'; end if;
  if session_row.current_step is distinct from target_step then raise exception 'STATE_INVALID'; end if;
  select * into state_row from step_states where session_id = target_session and step_no = target_step for update;
  if state_row.status not in ('active', 'teacher_review') then raise exception 'STATE_INVALID'; end if;

  select a.id into new_attempt_id from step_attempts a where a.request_id = request_key;
  if new_attempt_id is not null then
    select e.id into new_evaluation_id from evaluations e where e.attempt_id = new_attempt_id;
    return new_evaluation_id;
  end if;

  decision_value := evaluation_result->>'decision';
  score_value := coalesce((evaluation_result->'scores'->>'knowledge')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'operation')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'decision')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'troubleshooting')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'analysis')::integer, 0);

  insert into step_attempts(session_id, step_no, version_no, request_id, answer)
  values (target_session, target_step, state_row.attempt_count + 1, request_key, student_answer)
  returning id into new_attempt_id;

  insert into evaluations(attempt_id, decision, confidence, total_score, result, prompt_version, workflow_run_id, requires_teacher_review)
  values (new_attempt_id, decision_value, (evaluation_result->>'confidence')::numeric, score_value,
    evaluation_result, prompt_version_value, workflow_run_value,
    coalesce((evaluation_result->>'requiresTeacherReview')::boolean, false))
  returning id into new_evaluation_id;

  insert into agent_messages(session_id, role, kind, step_no, content, metadata)
  values
    (target_session, 'user', 'step_answer', target_step, student_answer, jsonb_build_object('attemptId', new_attempt_id)),
    (target_session, 'assistant', 'feedback', target_step, evaluation_result->>'studentFeedback', jsonb_build_object('evaluationId', new_evaluation_id));

  if decision_value = 'pass' then
    update step_states set status = 'passed', attempt_count = attempt_count + 1,
      final_summary = evaluation_result->>'teacherSummary', passed_at = now(), updated_at = now()
    where id = state_row.id;
    if target_step < 8 then
      next_step := target_step + 1;
      update step_states set status = 'active', updated_at = now()
      where session_id = target_session and step_no = next_step;
      update agent_sessions set current_step = next_step, updated_at = now() where id = target_session;
    else
      update agent_sessions set completed_at = now(), updated_at = now() where id = target_session;
    end if;
  else
    update step_states set
      status = case when state_row.attempt_count + 1 >= 3 and coalesce(jsonb_array_length(evaluation_result->'safetyAlerts'), 0) = 0
        then 'teacher_review' else 'active' end,
      attempt_count = attempt_count + 1, updated_at = now()
    where id = state_row.id;
  end if;

  insert into sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (request_key, 'step_evaluation', new_evaluation_id, jsonb_build_object(
    'student_id', viewer::text,
    'step_id', target_step,
    'version_no', state_row.attempt_count + 1,
    'student_answer', student_answer,
    'ai_feedback', evaluation_result->>'studentFeedback',
    'gate_status', decision_value,
    'total_score', score_value,
    'ai_confidence', evaluation_result->>'confidence'
  ));

  return new_evaluation_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "record_learning_report"(
  target_session uuid,
  report_content jsonb,
  report_markdown text,
  workflow_run_value text default null
)
RETURNS "learning_reports"
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  viewer uuid := auth.uid();
  session_row agent_sessions;
  result learning_reports;
  next_version integer;
  event_key uuid := gen_random_uuid();
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into session_row from agent_sessions where id = target_session;
  if session_row.user_id is distinct from viewer then raise exception 'FORBIDDEN'; end if;
  select coalesce(max(version), 0) + 1 into next_version from learning_reports where session_id = target_session;
  insert into learning_reports(session_id, version, content, rendered_markdown, workflow_run_id)
  values (target_session, next_version, report_content, report_markdown, workflow_run_value)
  returning * into result;
  insert into sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (event_key, 'learning_report', result.id, jsonb_build_object(
    'student_id', viewer::text,
    'final_report', report_markdown
  ));
  return result;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "record_teacher_review"(
  target_evaluation uuid,
  review_decision text,
  review_comment text
)
RETURNS "teacher_reviews"
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  viewer uuid := auth.uid();
  target_class uuid;
  student_uid uuid;
  result teacher_reviews;
  event_key uuid := gen_random_uuid();
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  if review_decision not in ('confirm', 'adjust', 'comment_only') then raise exception 'VALIDATION_ERROR'; end if;
  select s.class_id, s.user_id into target_class, student_uid
  from evaluations e join step_attempts a on a.id = e.attempt_id
  join agent_sessions s on s.id = a.session_id where e.id = target_evaluation;
  if not is_authorized_teacher(target_class) then raise exception 'FORBIDDEN'; end if;
  insert into teacher_reviews(evaluation_id, teacher_id, decision, comment)
  values (target_evaluation, viewer, review_decision, review_comment) returning * into result;
  insert into sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (event_key, 'teacher_review', result.id, jsonb_build_object(
    'student_id', student_uid::text,
    'teacher_comment', review_comment
  ));
  return result;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "log_event"(
  p_user_id uuid,
  p_event_type text,
  p_request_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO event_logs(user_id, event_type, request_id, payload)
  VALUES (p_user_id, p_event_type, p_request_id, p_payload);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_outbox_counts"()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE result jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO result
  FROM (SELECT status, count(*) AS cnt FROM sync_outbox GROUP BY status) t;
  RETURN result;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "claim_pending_outbox"(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'event_id', event_id, 'payload', payload, 'attempt_count', attempt_count
  )), '[]'::jsonb) INTO result
  FROM (
    SELECT id, event_id, payload, attempt_count
    FROM sync_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT p_limit
  ) t;
  RETURN result;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "update_outbox"(
  p_id uuid,
  p_status text,
  p_attempt_count integer DEFAULT NULL,
  p_last_error text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_next_attempt_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sync_outbox SET
    status = p_status,
    attempt_count = COALESCE(p_attempt_count, attempt_count),
    last_error = p_last_error,
    payload = COALESCE(p_payload, payload),
    next_attempt_at = COALESCE(p_next_attempt_at, next_attempt_at),
    updated_at = now()
  WHERE id = p_id;
END;
$$;
-- === managed grants ===
REVOKE ALL ON TABLE
  "profiles","courses","classes","enrollments","experiments","experiment_steps",
  "rubrics","rubric_items","knowledge_chunks","instrument_catalog","image_questions",
  "content_versions","agent_sessions","agent_messages","step_states","step_attempts",
  "evaluations","media_submissions","learning_reports","teacher_reviews"
FROM anon;
REVOKE ALL ON TABLE
  "profiles","courses","classes","enrollments","experiments","experiment_steps",
  "rubrics","rubric_items","knowledge_chunks","instrument_catalog","image_questions",
  "content_versions","agent_sessions","agent_messages","step_states","step_attempts",
  "evaluations","media_submissions","learning_reports","teacher_reviews"
FROM authenticated;
GRANT SELECT ON TABLE
  "profiles","courses","classes","enrollments","experiments","experiment_steps",
  "rubrics","rubric_items","knowledge_chunks","instrument_catalog","image_questions",
  "content_versions","agent_sessions","agent_messages","step_states","step_attempts",
  "evaluations","media_submissions","learning_reports","teacher_reviews"
TO authenticated;
GRANT INSERT, UPDATE ON TABLE "agent_sessions" TO authenticated;
GRANT INSERT ON TABLE "agent_messages" TO authenticated;
GRANT INSERT ON TABLE "media_submissions" TO authenticated;
GRANT INSERT ON TABLE "learning_reports" TO authenticated;
GRANT INSERT ON TABLE "teacher_reviews" TO authenticated;
GRANT SELECT ON TABLE "student_experiment_profiles","quiz_sessions","quiz_questions" TO authenticated;
GRANT INSERT, UPDATE ON TABLE "quiz_sessions" TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE "quiz_questions" TO authenticated;
REVOKE ALL ON TABLE
  "ai_jobs","event_logs","audit_logs","sync_outbox","external_identities"
FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION "is_authorized_teacher"(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION "is_teacher_user"() FROM public, anon;
REVOKE EXECUTE ON FUNCTION "start_or_resume_student_session"() FROM public, anon;
REVOKE EXECUTE ON FUNCTION "record_text_evaluation"(uuid,smallint,uuid,text,jsonb,text,text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION "record_learning_report"(uuid,jsonb,text,text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION "record_teacher_review"(uuid,text,text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION "log_event"(uuid,text,uuid,jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION "sync_outbox_counts"() FROM public, anon;
REVOKE EXECUTE ON FUNCTION "claim_pending_outbox"(integer) FROM public;
REVOKE EXECUTE ON FUNCTION "update_outbox"(uuid,text,integer,text,jsonb,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION "is_authorized_teacher"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "is_teacher_user"() TO authenticated;
GRANT EXECUTE ON FUNCTION "start_or_resume_student_session"() TO authenticated;
GRANT EXECUTE ON FUNCTION "record_text_evaluation"(uuid,smallint,uuid,text,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION "record_learning_report"(uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION "record_teacher_review"(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION "log_event"(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION "sync_outbox_counts"() TO authenticated;
GRANT EXECUTE ON FUNCTION "claim_pending_outbox"(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION "update_outbox"(uuid,text,integer,text,jsonb,timestamptz) TO authenticated, anon;
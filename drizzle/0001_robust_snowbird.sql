CREATE TABLE "quiz_question_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid() NOT NULL,
	"question_id" uuid NOT NULL,
	"step_no" integer NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_question_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quiz_question_assignments" ADD CONSTRAINT "quiz_question_assignments_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question_assignments" ADD CONSTRAINT "quiz_question_assignments_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "quiz_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_question_assignments_user_question_key" ON "quiz_question_assignments" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_quiz_assignments_user_step" ON "quiz_question_assignments" USING btree ("user_id","step_no");--> statement-breakpoint
CREATE INDEX "idx_quiz_assignments_question" ON "quiz_question_assignments" USING btree ("question_id");--> statement-breakpoint
CREATE POLICY "quiz_assignments_own_read" ON "quiz_question_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((SELECT auth.uid()) = "quiz_question_assignments"."user_id");--> statement-breakpoint
CREATE POLICY "quiz_assignments_own_insert" ON "quiz_question_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((SELECT auth.uid()) = "quiz_question_assignments"."user_id");

-- === managed grants ===
REVOKE ALL ON TABLE "quiz_question_assignments" FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE "quiz_question_assignments" TO authenticated;

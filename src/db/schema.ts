import { sql } from 'drizzle-orm';
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  smallint,
  bigint,
  integer,
  numeric,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authenticatedRole } from 'drizzle-orm/supabase';

/**
 * 生物化学实验智能体 —— 业务表 Drizzle 定义。
 *
 * 仅用于定义表结构与 RLS Policy（drizzle-kit generate 生成迁移 SQL），
 * 不创建任何查询客户端；所有 CRUD 通过 Supabase JS SDK 完成。
 *
 * 约定：
 *  - 业务对象一律不带 Schema（由平台在租户 schema 中置入 search_path）
 *  - 需要登录用户归属判定使用 `(SELECT auth.uid())`
 *  - 服务端专表（不向浏览器开放）用 pgTable.withRLS()，依赖默认拒绝
 */

const uid = (name: string) => uuid(name).notNull().default(sql`gen_random_uuid()`);
const now = (name = 'created_at') =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** 用户档案 / 角色（主键引用 auth.users.id，不建 Drizzle 外键） */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    display_name: text('display_name').notNull(),
    role: text('role').notNull().default('student'),
    student_no: text('student_no'),
    major_name: text('major_name'),
    grade_name: text('grade_name'),
    class_name: text('class_name'),
    academic_source: text('academic_source'),
    created_at: now(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('profiles_academic_dimensions_idx').on(
      table.major_name,
      table.grade_name,
      table.class_name,
    ),
    pgPolicy('profiles_self_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.id}`,
    }),
    pgPolicy('profiles_teacher_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM enrollments target JOIN enrollments viewer ON viewer.class_id = target.class_id
        WHERE target.user_id = ${table.id} AND viewer.user_id = (SELECT auth.uid())
          AND viewer.role IN ('teacher','content_admin'))`,
    }),
  ],
);

/** 第三方（超星）身份映射，服务端专写 */
export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uid('id').primaryKey(),
    user_id: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    external_uid: text('external_uid').notNull(),
    fid: text('fid'),
    raw_roles: jsonb('raw_roles').notNull().default(sql`'[]'::jsonb`),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('external_identities_provider_external_uid_fid_key').on(
      table.provider,
      table.external_uid,
      table.fid,
    ),
  ],
).enableRLS();

export const courses = pgTable(
  'courses',
  {
    id: uid('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('courses_code_key').on(table.code),
    pgPolicy('course_authenticated_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.active} = true`,
    }),
  ],
);

export const classes = pgTable(
  'classes',
  {
    id: uid('id').primaryKey(),
    course_id: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    term: text('term'),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('classes_course_id_name_term_key').on(
      table.course_id,
      table.name,
      table.term,
    ),
    index('classes_course_id_idx').on(table.course_id),
    pgPolicy('class_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id = ${table.id} AND e.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uid('id').primaryKey(),
    class_id: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('enrollments_class_id_user_id_key').on(table.class_id, table.user_id),
    index('enrollments_class_id_idx').on(table.class_id),
    index('enrollments_user_id_idx').on(table.user_id),
    pgPolicy('enrollment_self_or_teacher_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.user_id} = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(${table.class_id}))`,
    }),
  ],
);

export const experiments = pgTable(
  'experiments',
  {
    id: uid('id').primaryKey(),
    course_id: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('published'),
    source_hash: text('source_hash'),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('experiments_course_id_slug_version_key').on(
      table.course_id,
      table.slug,
      table.version,
    ),
    index('experiments_course_id_idx').on(table.course_id),
    pgPolicy('experiment_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM classes c JOIN enrollments e ON e.class_id = c.id
        WHERE c.course_id = ${table.course_id} AND e.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const experimentSteps = pgTable(
  'experiment_steps',
  {
    id: uid('id').primaryKey(),
    experiment_id: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    context: text('context').notNull(),
    goal: text('goal').notNull(),
    content: jsonb('content').notNull(),
    source_ref: text('source_ref').notNull(),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('experiment_steps_experiment_id_step_no_key').on(
      table.experiment_id,
      table.step_no,
    ),
    index('experiment_steps_experiment_id_idx').on(table.experiment_id),
    pgPolicy('step_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id
        WHERE x.id = ${table.experiment_id} AND e.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const rubrics = pgTable(
  'rubrics',
  {
    id: uid('id').primaryKey(),
    step_id: uuid('step_id').notNull().references(() => experimentSteps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    pass_score: smallint('pass_score').notNull().default(80),
    status: text('status').notNull().default('published'),
    source_ref: text('source_ref').notNull(),
  },
  (table) => [
    uniqueIndex('rubrics_step_id_version_key').on(table.step_id, table.version),
    index('rubrics_step_id_idx').on(table.step_id),
    pgPolicy('rubric_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiment_steps s JOIN experiments x ON x.id = s.experiment_id
        JOIN classes c ON c.course_id = x.course_id
        WHERE s.id = ${table.step_id} AND (SELECT is_authorized_teacher(c.id)))`,
    }),
  ],
);

export const rubricItems = pgTable(
  'rubric_items',
  {
    id: uid('id').primaryKey(),
    rubric_id: uuid('rubric_id').notNull().references(() => rubrics.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    dimension: text('dimension').notNull(),
    label: text('label').notNull(),
    weight: smallint('weight').notNull(),
    required_points: jsonb('required_points').notNull().default(sql`'[]'::jsonb`),
    accepted_phrases: jsonb('accepted_phrases').notNull().default(sql`'[]'::jsonb`),
    gates: jsonb('gates').notNull().default(sql`'[]'::jsonb`),
    hints: jsonb('hints').notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex('rubric_items_rubric_id_code_key').on(table.rubric_id, table.code),
    index('rubric_items_rubric_id_idx').on(table.rubric_id),
    pgPolicy('rubric_item_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM rubrics r JOIN experiment_steps s ON s.id = r.step_id
        JOIN experiments x ON x.id = s.experiment_id JOIN classes c ON c.course_id = x.course_id
        WHERE r.id = ${table.rubric_id} AND (SELECT is_authorized_teacher(c.id)))`,
    }),
  ],
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uid('id').primaryKey(),
    experiment_id: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    structured_data: jsonb('structured_data').notNull().default(sql`'{}'::jsonb`),
    source_file: text('source_file').notNull(),
    source_location: text('source_location'),
    source_hash: text('source_hash').notNull(),
    version: integer('version').notNull().default(1),
    teacher_confirmed: boolean('teacher_confirmed').notNull().default(false),
    created_at: now(),
  },
  (table) => [
    index('knowledge_chunks_step_idx').on(table.experiment_id, table.step_no, table.kind),
    pgPolicy('knowledge_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        WHERE x.id = ${table.experiment_id} AND (SELECT is_authorized_teacher(c.id)))`,
    }),
  ],
);

export const instrumentCatalog = pgTable(
  'instrument_catalog',
  {
    id: uid('id').primaryKey(),
    experiment_id: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    aliases: jsonb('aliases').notNull().default(sql`'[]'::jsonb`),
    purpose: text('purpose').notNull(),
    safety_points: jsonb('safety_points').notNull().default(sql`'[]'::jsonb`),
    applicable_steps: jsonb('applicable_steps').notNull().default(sql`'[]'::jsonb`),
    image_path: text('image_path'),
    source_ref: text('source_ref').notNull(),
  },
  (table) => [
    uniqueIndex('instrument_catalog_experiment_id_name_key').on(
      table.experiment_id,
      table.name,
    ),
    index('instrument_catalog_experiment_id_idx').on(table.experiment_id),
    pgPolicy('instrument_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id WHERE x.id = ${table.experiment_id} AND e.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const imageQuestions = pgTable(
  'image_questions',
  {
    id: uid('id').primaryKey(),
    experiment_id: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no').notNull(),
    prompt: text('prompt').notNull(),
    image_path: text('image_path').notNull(),
    labels: jsonb('labels').notNull(),
    safety_critical: boolean('safety_critical').notNull().default(false),
    source_ref: text('source_ref').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    index('image_questions_experiment_id_idx').on(table.experiment_id),
    pgPolicy('image_question_enrolled_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        JOIN enrollments e ON e.class_id = c.id WHERE x.id = ${table.experiment_id} AND e.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const contentVersions = pgTable(
  'content_versions',
  {
    id: uid('id').primaryKey(),
    experiment_id: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    manifest: jsonb('manifest').notNull(),
    source_hash: text('source_hash').notNull(),
    published_at: timestamp('published_at', { withTimezone: true }),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('content_versions_experiment_id_version_key').on(
      table.experiment_id,
      table.version,
    ),
    index('content_versions_experiment_id_idx').on(table.experiment_id),
    pgPolicy('content_versions_teacher_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM experiments x JOIN classes c ON c.course_id = x.course_id
        WHERE x.id = ${table.experiment_id} AND (SELECT is_authorized_teacher(c.id)))`,
    }),
  ],
);

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: uid('id').primaryKey(),
    user_id: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    experiment_id: uuid('experiment_id').references(() => experiments.id, { onDelete: 'restrict' }),
    class_id: uuid('class_id').references(() => classes.id, { onDelete: 'restrict' }),
    agent_role: text('agent_role').notNull(),
    current_step: smallint('current_step'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: now(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('one_active_student_session_idx')
      .on(table.user_id, table.experiment_id)
      .where(sql`${table.agent_role} = 'student' AND ${table.completed_at} IS NULL`),
    index('agent_sessions_class_idx').on(table.class_id, table.agent_role, table.current_step),
    index('agent_sessions_user_id_idx').on(table.user_id),
    index('agent_sessions_experiment_id_idx').on(table.experiment_id),
    pgPolicy('session_owner_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.user_id} = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(${table.class_id}))`,
    }),
    pgPolicy('session_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.user_id} = (SELECT auth.uid())`,
    }),
    pgPolicy('session_owner_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`${table.user_id} = (SELECT auth.uid())`,
      withCheck: sql`${table.user_id} = (SELECT auth.uid())`,
    }),
  ],
);

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uid('id').primaryKey(),
    session_id: uuid('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    kind: text('kind').notNull(),
    step_no: smallint('step_no'),
    content: text('content').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    created_at: now(),
  },
  (table) => [
    index('agent_messages_session_idx').on(table.session_id, table.created_at),
    pgPolicy('message_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
    pgPolicy('message_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id} AND s.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const stepStates = pgTable(
  'step_states',
  {
    id: uid('id').primaryKey(),
    session_id: uuid('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no').notNull(),
    status: text('status').notNull(),
    attempt_count: smallint('attempt_count').notNull().default(0),
    final_summary: text('final_summary'),
    passed_at: timestamp('passed_at', { withTimezone: true }),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('step_states_session_id_step_no_key').on(table.session_id, table.step_no),
    index('step_states_session_id_idx').on(table.session_id),
    pgPolicy('step_state_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
  ],
);

export const stepAttempts = pgTable(
  'step_attempts',
  {
    id: uid('id').primaryKey(),
    session_id: uuid('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no').notNull(),
    version_no: smallint('version_no').notNull(),
    request_id: uuid('request_id').notNull(),
    answer: text('answer').notNull(),
    submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('step_attempts_request_id_key').on(table.request_id),
    uniqueIndex('step_attempts_session_id_step_no_version_no_key').on(
      table.session_id,
      table.step_no,
      table.version_no,
    ),
    index('step_attempts_session_id_idx').on(table.session_id),
    pgPolicy('attempt_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
  ],
);

export const evaluations = pgTable(
  'evaluations',
  {
    id: uid('id').primaryKey(),
    attempt_id: uuid('attempt_id')
      .notNull()
      .references(() => stepAttempts.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    total_score: smallint('total_score').notNull(),
    result: jsonb('result').notNull(),
    prompt_version: text('prompt_version').notNull(),
    workflow_run_id: text('workflow_run_id'),
    requires_teacher_review: boolean('requires_teacher_review').notNull().default(false),
    created_at: now(),
  },
  (table) => [
    index('evaluations_attempt_id_idx').on(table.attempt_id),
    pgPolicy('evaluation_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM step_attempts a JOIN agent_sessions s ON s.id = a.session_id
        WHERE a.id = ${table.attempt_id} AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
  ],
);

export const mediaSubmissions = pgTable(
  'media_submissions',
  {
    id: uid('id').primaryKey(),
    session_id: uuid('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    step_no: smallint('step_no').notNull(),
    storage_path: text('storage_path').notNull(),
    mime_type: text('mime_type').notNull(),
    size_bytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    evaluation: jsonb('evaluation'),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('media_submissions_session_id_sha256_key').on(
      table.session_id,
      table.sha256,
    ),
    index('media_submissions_session_id_idx').on(table.session_id),
    pgPolicy('media_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
    pgPolicy('media_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id} AND s.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const learningReports = pgTable(
  'learning_reports',
  {
    id: uid('id').primaryKey(),
    session_id: uuid('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    content: jsonb('content').notNull(),
    rendered_markdown: text('rendered_markdown').notNull(),
    workflow_run_id: text('workflow_run_id'),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('learning_reports_session_id_version_key').on(
      table.session_id,
      table.version,
    ),
    index('learning_reports_session_id_idx').on(table.session_id),
    pgPolicy('report_session_access', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND (s.user_id = (SELECT auth.uid()) OR (SELECT is_authorized_teacher(s.class_id))))`,
    }),
    pgPolicy('report_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id} AND s.user_id = (SELECT auth.uid()))`,
    }),
  ],
);

export const teacherReviews = pgTable(
  'teacher_reviews',
  {
    id: uid('id').primaryKey(),
    evaluation_id: uuid('evaluation_id').references(() => evaluations.id, { onDelete: 'cascade' }),
    report_id: uuid('report_id').references(() => learningReports.id, { onDelete: 'cascade' }),
    teacher_id: uuid('teacher_id').notNull().references(() => profiles.id, { onDelete: 'restrict' }),
    decision: text('decision'),
    comment: text('comment'),
    created_at: now(),
  },
  (table) => [
    index('teacher_reviews_evaluation_id_idx').on(table.evaluation_id),
    index('teacher_reviews_teacher_id_idx').on(table.teacher_id),
    pgPolicy('review_teacher_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.teacher_id} = (SELECT auth.uid()) OR EXISTS(
        SELECT 1 FROM evaluations v JOIN step_attempts a ON a.id = v.attempt_id
        JOIN agent_sessions s ON s.id = a.session_id
        WHERE v.id = ${table.evaluation_id} AND s.user_id = (SELECT auth.uid()))`,
    }),
    pgPolicy('review_teacher_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`${table.teacher_id} = (SELECT auth.uid()) AND (
        ${table.evaluation_id} IS NULL OR EXISTS(
          SELECT 1 FROM evaluations v JOIN step_attempts a ON a.id = v.attempt_id
          JOIN agent_sessions s ON s.id = a.session_id
          WHERE v.id = ${table.evaluation_id} AND (SELECT is_authorized_teacher(s.class_id))))`,
    }),
  ],
);

/** 服务端专表：不向浏览器会话开放（RLS 开启但无策略，默认拒绝） */

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id: uid('id').primaryKey(),
    request_id: uuid('request_id').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    error_code: text('error_code'),
    error_message: text('error_message'),
    started_at: timestamp('started_at', { withTimezone: true }),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    created_at: now(),
  },
  (table) => [
    uniqueIndex('ai_jobs_request_id_key').on(table.request_id),
  ],
).enableRLS();

export const eventLogs = pgTable(
  'event_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    user_id: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    event_type: text('event_type').notNull(),
    request_id: uuid('request_id'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    created_at: now(),
  },
  (table) => [
    index('event_logs_user_id_idx').on(table.user_id),
    index('event_logs_event_type_idx').on(table.event_type),
  ],
).enableRLS();

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actor_id: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target_type: text('target_type').notNull(),
    target_id: text('target_id').notNull(),
    before_value: jsonb('before_value'),
    after_value: jsonb('after_value'),
    created_at: now(),
  },
  (table) => [
    index('audit_logs_actor_id_idx').on(table.actor_id),
    index('audit_logs_action_idx').on(table.action, table.created_at),
  ],
).enableRLS();

export const syncOutbox = pgTable(
  'sync_outbox',
  {
    id: uid('id').primaryKey(),
    event_id: uuid('event_id').notNull(),
    aggregate_type: text('aggregate_type').notNull(),
    aggregate_id: uuid('aggregate_id').notNull(),
    destination: text('destination').notNull().default('chaoxing_form_3513491'),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempt_count: integer('attempt_count').notNull().default(0),
    next_attempt_at: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    last_error: text('last_error'),
    created_at: now(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sync_outbox_event_id_key').on(table.event_id),
    index('sync_outbox_worker_idx').on(table.status, table.next_attempt_at),
  ],
).enableRLS();

export const quizSessions = pgTable(
  'quiz_sessions',
  {
    id: uid('id').primaryKey(),
    user_id: uuid('user_id').notNull().default(sql`auth.uid()`),
    step_no: integer('step_no').notNull(),
    questions: jsonb('questions').notNull().default(sql`'[]'::jsonb`),
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    results: jsonb('results'),
    status: text('status').notNull().default('in_progress'),
    created_at: now(),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    graded_at: timestamp('graded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('quiz_sessions_user_id_step_no_created_at_key').on(
      table.user_id,
      table.step_no,
      table.created_at,
    ),
    index('idx_quiz_sessions_user_step').on(table.user_id, table.step_no),
    index('idx_quiz_sessions_status')
      .on(table.status)
      .where(sql`${table.status} = 'submitted'`),
    uniqueIndex('one_in_progress_quiz_per_student_step_idx')
      .on(table.user_id, table.step_no)
      .where(sql`${table.status} = 'in_progress'`),
    pgPolicy('quiz_sessions_own_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('quiz_sessions_own_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
    pgPolicy('quiz_sessions_own_update', {
      for: 'update',
      to: authenticatedRole,
      using: sql`(SELECT auth.uid()) = ${table.user_id}`,
      withCheck: sql`(SELECT auth.uid()) = ${table.user_id}`,
    }),
  ],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uid('id').primaryKey(),
    step_no: integer('step_no').notNull(),
    dimension: text('dimension').notNull(),
    question_text: text('question_text').notNull(),
    options: jsonb('options').notNull(),
    correct_option_id: text('correct_option_id').notNull(),
    explanation: text('explanation').notNull(),
    status: text('status').notNull().default('published'),
    created_by: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    created_at: now(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_quiz_questions_step').on(table.step_no),
    index('idx_quiz_questions_dimension').on(table.step_no, table.dimension),
    index('idx_quiz_questions_step_status_updated').on(
      table.step_no,
      table.status,
      sql`${table.updated_at} desc`,
    ),
    index('idx_quiz_questions_created_by').on(table.created_by),
    uniqueIndex('quiz_questions_step_text_unique_idx').on(
      table.step_no,
      sql`md5(lower(${table.question_text}))`,
    ),
  ],
).enableRLS();

export const studentExperimentProfiles = pgTable(
  'student_experiment_profiles',
  {
    session_id: uuid('session_id')
      .primaryKey()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    target_gene: text('target_gene').notNull().default('EGFP'),
    sequence_source: text('sequence_source').notNull().default('recommended'),
    accession: text('accession'),
    coding_sequence: text('coding_sequence'),
    cloning_strategy: text('cloning_strategy').notNull().default('recombination'),
    design_snapshot: jsonb('design_snapshot').notNull().default(sql`'{}'::jsonb`),
    created_at: now(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    pgPolicy('student_experiment_profile_owner_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND s.user_id = (SELECT auth.uid()) AND s.agent_role = 'student')`,
    }),
    pgPolicy('student_experiment_profile_teacher_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`EXISTS(SELECT 1 FROM agent_sessions s WHERE s.id = ${table.session_id}
        AND s.agent_role = 'student' AND (SELECT is_authorized_teacher(s.class_id)))`,
    }),
  ],
);
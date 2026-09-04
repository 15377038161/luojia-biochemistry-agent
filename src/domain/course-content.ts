import type { DimensionScores, ExperimentStep } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';

export interface CourseContentAsset {
  id: string;
  stepId: number;
  kind: 'case_image' | 'instrument' | 'knowledge';
  title: string;
  path: string;
  sourceRef: string;
}

export interface CourseContentPayload {
  schemaVersion: 'CourseContent.v2';
  title: string;
  targetProtein: string;
  primaryStrategy: 'recombination';
  alternativeStrategy: 'double_digest';
  steps: ExperimentStep[];
  assets: CourseContentAsset[];
}

export interface ContentValidation {
  valid: boolean;
  errors: string[];
}

const DIMENSIONS: Array<keyof DimensionScores> = ['knowledge', 'operation', 'decision', 'troubleshooting', 'analysis'];

export function defaultCourseContent(): CourseContentPayload {
  return {
    schemaVersion: 'CourseContent.v2',
    title: '自选目标基因表达与纯化八步文字实验',
    targetProtein: 'EGFP',
    primaryStrategy: 'recombination',
    alternativeStrategy: 'double_digest',
    steps: experimentSteps,
    assets: [],
  };
}

export function validateCourseContent(value: unknown): ContentValidation {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { valid: false, errors: ['内容不是有效对象。'] };
  const payload = value as Partial<CourseContentPayload>;
  if (payload.schemaVersion !== 'CourseContent.v2') errors.push('内容版本必须是 CourseContent.v2。');
  if (!payload.targetProtein?.trim()) errors.push('课程必须设置默认目标蛋白（学生会话可另选目标基因）。');
  if (payload.primaryStrategy !== 'recombination') errors.push('主线策略必须是重组克隆。');
  if (!Array.isArray(payload.steps) || payload.steps.length !== 8) {
    errors.push('必须包含连续的八个步骤。');
    return { valid: false, errors };
  }

  const ids = payload.steps.map((step) => step.id);
  if (ids.some((id, index) => id !== index + 1)) errors.push('步骤编号必须按1到8连续排列。');
  for (const step of payload.steps) {
    if (!step.title?.trim() || !step.context?.trim() || !step.goal?.trim()) errors.push(`步骤${step.id}缺少标题、情境或目标。`);
    if (!step.source?.trim()) errors.push(`步骤${step.id}缺少可追溯来源。`);
    if (!step.principle?.trim() || !step.scientificPractice?.trim()) errors.push(`步骤${step.id}缺少原理或科学实践要求。`);
    if (!step.sopParameters?.length || !step.safetyNotes?.length || !step.decisionTree?.length || !step.instruments?.length) errors.push(`步骤${step.id}缺少SOP、安全、决策树或设备内容。`);
    if (!Array.isArray(step.gates) || step.gates.length === 0) errors.push(`步骤${step.id}至少需要一条Gate规则。`);
    for (const dimension of DIMENSIONS) {
      if (!step.keyPoints?.some((point) => point.dimension === dimension)) errors.push(`步骤${step.id}缺少${dimension}维度评分点。`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function parseCourseContent(value: unknown): CourseContentPayload {
  const validation = validateCourseContent(value);
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  return value as CourseContentPayload;
}

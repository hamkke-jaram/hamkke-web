import type { Connect } from 'vite';
import type { GuidanceOption } from '../../src/ai/momentGuidance.mjs';

type Evidence = {
  observations: { timeSec: number; note: string }[];
  observationSummary?: string;
};

type Draft = Evidence & {
  teacherDraft: string;
  teacherContext?: string;
  proposedSupport?: string;
};

type ModelSource = { model: string; source: 'ollama' };
type DatedDetail = { detail: string; timeSec: number | null };
type CheckKind = 'SUPPORTED' | 'NEEDS_EVIDENCE' | 'TEACHER_CONTEXT' | 'WORDING';

export type TeacherGuidance = Omit<GuidanceOption, 'id'> & {
  evidence: string;
  timeSec: number | null;
};

export type TeacherSupport = {
  source: 'ollama' | 'observation-rules';
  model: string | null;
  guidance: TeacherGuidance[];
  suggestions: DatedDetail[];
};

export function recheckTeacherDraft(input: Draft, signal?: AbortSignal): Promise<ModelSource & {
  summary: string;
  checks: ({ kind: CheckKind } & DatedDetail)[];
}>;

export function suggestTeacherSupport(input: Evidence, signal?: AbortSignal): Promise<TeacherSupport>;

export function installTeacherReviewRecheck(middlewares: Connect.Server): void;

export type Role = 'PARENT' | 'TEACHER';
export type ChangeTrend = 'FIRST_RECORD' | 'GROWING' | 'STEADY' | 'NEEDS_ATTENTION';
export type MetricChange = 'UP' | 'FLAT' | 'DOWN' | 'NA';
export type MetricFocus = 'JOINT_PLAY' | 'RESPONSE' | 'CALM' | 'GENERAL';
export type GoalStatus = 'IN_PROGRESS' | 'ACHIEVED' | 'ARCHIVED';
export type SharedItem = 'JOINT_PLAY' | 'RESPONSE_LATENCY' | 'DISTRESS' | 'COACHING_CARDS';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
}

export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: User;
}

export interface Policies {
  termsVersion: string;
  privacyVersion: string;
  guardianVersion: string;
  disclaimer: string;
}

export interface Child {
  id: number;
  nickname: string;
  birthYearMonth: string;
  ageMonths: number;
  createdAt: string;
}

export interface RecordItem {
  id: number;
  recordedAt: string;
  analyzedSeconds: number;
  jointPlaySeconds: number;
  jointPlayRatio: number;
  responseLatencySec: number | null;
  childBidCount: number;
  respondedBidCount: number;
  distressEpisodeCount: number;
  distressPerTenMinutes: number;
  changeTrend: ChangeTrend;
}

export interface Card {
  id: number;
  title: string;
  body: string;
  situation: string;
  metricFocus: MetricFocus;
  evidenceTag: string;
  sourceTitle: string;
  sourceUrl: string | null;
  author: string;
  reviewer: string | null;
}

export interface Delivery {
  id: number;
  deliveredAt: string;
  triedAt: string | null;
  card: Card;
}

export interface SupportResource {
  id: number;
  name: string;
  description: string;
  phone: string | null;
  url: string | null;
  hours: string | null;
  category: string;
}

export interface Guidance {
  message: string;
  resources: SupportResource[];
}

export interface SaveRecordResponse {
  record: RecordItem;
  metricChanges: { jointPlay: MetricChange; response: MetricChange; calm: MetricChange };
  coaching: { delivery: Delivery | null; guidance: Guidance | null };
}

export interface WeekSummary {
  weekStart: string;
  recordCount: number;
  jointPlayRatio?: number | null;
  jointPlaySeconds?: number | null;
  responseLatencySec?: number | null;
  distressPerTenMinutes?: number | null;
}

export interface ShareSettings {
  jointPlay: boolean;
  responseLatency: boolean;
  distress: boolean;
  coachingCards: boolean;
  updatedAt?: string;
}

export interface InviteCode {
  code: string;
  expiresAt: string;
}

export interface LinkedTeacher {
  teacherId: number;
  displayName: string;
  linkedAt: string;
}

export interface TeacherChild {
  id: number;
  nickname: string;
  ageMonths: number;
  linkedAt: string;
}

export interface SharedSummary {
  child: { id: number; nickname: string; ageMonths: number };
  sharedItems: SharedItem[];
  weeks: WeekSummary[];
}

export interface Goal {
  id: number;
  title: string;
  description: string;
  status: GoalStatus;
  teacherId: number;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Observation {
  id: number;
  content: string;
  observedOn: string;
  teacherId: number;
  teacherName: string;
  createdAt: string;
}

export interface ConsentRecord {
  type: string;
  version: string;
  childId: number | null;
  agreedAt: string;
  revokedAt: string | null;
}

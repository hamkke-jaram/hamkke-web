export type Role = 'PARENT' | 'TEACHER';
export type ChangeTrend = 'FIRST_RECORD' | 'GROWING' | 'STEADY' | 'NEEDS_ATTENTION';
export type MetricChange = 'UP' | 'FLAT' | 'DOWN' | 'NA';
export type MetricFocus = 'JOINT_PLAY' | 'RESPONSE' | 'CALM' | 'GENERAL' | 'HARD_MOMENT';
export type GoalStatus = 'IN_PROGRESS' | 'ACHIEVED' | 'ARCHIVED';
export type SharedItem =
  | 'JOINT_PLAY'
  | 'RESPONSE_LATENCY'
  | 'DISTRESS'
  | 'COACHING_CARDS'
  | 'AI_OBSERVATIONS'
  | 'INSTITUTION_CAPTURE';

/** 다시 동의를 받을 수 있는 계정 약관 종류(POST /me/consents). */
export type PolicyConsentType = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  /**
   * GET /me에만 있다. 약관·개인정보 처리 방침이 바뀌어 다시 동의가 필요한 항목(보통 빈 배열).
   * 로그인 응답(TokenResponse.user)에는 없을 수 있어서, 로그인 뒤 /me를 다시 불러 확인한다.
   */
  pendingConsents?: PolicyConsentType[];
  /** 선생님의 기관·반 이름(PUT /me/teacher-profile). 보호자·예전 서버 응답에는 없다. */
  institution?: string | null;
  className?: string | null;
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
  /** 'AI 관찰 기록' 동의 내용의 버전. 동의를 보낼 때 그대로 돌려준다. */
  aiAnalysisVersion: string;
  /** AI 서버가 설정되어 있는지. false면 새로 만드는 화면을 숨긴다(이미 있는 기록 보기·삭제·동의 끄기는 남긴다). */
  aiObservationEnabled: boolean;
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
  /** 카드 코드(예: 'JP-G-01'). 그림 고르기에만 쓴다. 예전 서버 응답에는 없다. */
  code?: string;
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
  /** 가정에서 만든 AI 관찰 기록을 선생님에게 보임 */
  aiObservations: boolean;
  /** 연결된 선생님이 기관에서 장면 사진을 찍어 관찰 기록을 남길 수 있음 */
  institutionCapture: boolean;
  updatedAt?: string;
}

export interface InviteCode {
  code: string;
  expiresAt: string;
  /** GET /children/{id}/invite-codes 목록에만 있다. */
  createdAt?: string;
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

/** 선생님 이야기에 첨부한 코칭 카드(이 아이가 받은 카드). */
export interface AttachedCard {
  deliveryId: number;
  cardId: number;
  code?: string;
  title: string;
  body: string;
}

export interface Observation {
  id: number;
  /** 선생님 이야기 제목(없으면 null, 예전 서버 응답에는 없다). */
  title?: string | null;
  content: string;
  /** 첨부한 코칭 카드(없으면 null). */
  card?: AttachedCard | null;
  observedOn: string;
  teacherId: number;
  teacherName: string;
  createdAt: string;
}

export const STORY_TITLE_LIMIT = 40;
export const STORY_BODY_LIMIT = 1000;

export interface TeacherStoryDraft {
  title: string;
  content: string;
}

export interface ConsentRecord {
  type: string;
  version: string;
  childId: number | null;
  agreedAt: string;
  revokedAt: string | null;
}

/* ── AI 관찰 기록 (hamkke-api/docs/ai-observation.md) ── */

export type ObservationSource = 'HOME' | 'INSTITUTION';

/** GET /children/{id}/ai-consent */
export interface AiConsent {
  agreed: boolean;
  version: string | null;
  agreedAt: string | null;
}

/** POST /children/{id}/ai-sessions — 분석 한 번에 쓰는 토큰(사용자 로그인 토큰과 다르다). */
export interface AiSession {
  token: string;
  expiresAt: string;
  maxFrames: number;
}

export interface ObservationMoment {
  /** 보낸 장면 사진의 시각(초) */
  t: number;
  note: string;
}

/** AI 서버가 돌려주는 관찰 기록 객체(명세 6장). */
export interface ObservationContent {
  summary: string | null;
  childStates: string[];
  adultResponses: string[];
  moments: ObservationMoment[];
  /** 0~3. 3은 '3명 이상' */
  peopleCount: number;
}

/** POST /ai/v1/analyze 응답 */
export interface AnalyzeResponse {
  observation: ObservationContent;
  receipt: string;
  modelVersion: string;
  promptVersion: string;
  analyzedFrames: number;
}

/** 저장된 AI 관찰 기록 한 건. 사진은 없고 글과 태그만 있다. */
export interface AiObservation extends ObservationContent {
  id: number;
  source: ObservationSource;
  recordedAt: string;
  createdAt: string;
  /** 기록을 만든 사람의 표시 이름 */
  authorName?: string;
  /** 지금 로그인한 사람이 만든 기록인지(선생님 화면의 삭제 버튼에 쓴다) */
  mine?: boolean;
  modelVersion: string;
  reviewStatus?: 'PENDING' | 'PUBLISHED' | null;
  publishedGuidance?: PublishedGuidance | null;
}

export interface RecommendationEvidence {
  reason: string;
  sourceId: string;
  sourceTitle: string;
  sourcePublisher: string;
  sourceUrl: string;
  sourceSection: string;
}

export interface EvidenceRecommendation extends RecommendationEvidence {
  observation: string;
  action: string;
}

export interface ObservationGuidance {
  summary: string;
  recommendations: EvidenceRecommendation[];
  corpusVersion: string;
}

export interface GuidancePreview extends ObservationGuidance {
  receipt: string;
}

export interface TeacherRecommendation {
  action: string;
  rationale?: string | null;
}

export interface TeacherRecommendationEdit extends TeacherRecommendation {
  sourceId: string;
}

export interface PublishedGuidance extends ObservationGuidance {
  reviewedAt: string;
  teacherEdits?: TeacherRecommendationEdit[] | null;
  teacherRecommendation?: TeacherRecommendation | null;
}

export interface TeacherObservationReview {
  reviewerId: number;
  status: 'PENDING' | 'PUBLISHED';
  observation: AiObservation;
}

/** POST /children/{id}/ai-observations 응답. 기관 기록이면 coaching은 null. */
export interface SaveAiObservationResponse {
  observation: AiObservation;
  coaching: { delivery: Delivery | null } | null;
}

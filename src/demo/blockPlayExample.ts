import type { AiObservation, EvidenceRecommendation } from '../api/types';

export const blockPlayObservation: AiObservation = {
  id: 0, source: 'HOME', modelVersion: 'illustrated-example', recordedAt: '', createdAt: '',
  summary: '손이 블록을 하나씩 들어 올려 쌓아요.', peopleCount: -1, childStates: [], adultResponses: [],
  moments: [
    { t: 0.8, note: '파란 블록, 노란 블록, 분홍 블록이 바닥에 놓여 있어요.' },
    { t: 3.7, note: '손이 노란 블록을 들어 올려요.' },
    { t: 6.6, note: '노란 블록이 파란 블록 위에 놓여 있어요.' },
    { t: 9.4, note: '손이 분홍 블록을 들어 올려요.' },
  ],
};

// The same public passage used by the production RAG corpus (server/evidence/passages.sql).
export const blockPlayEvidence: EvidenceRecommendation = {
  observation: '손이 노란 블록을 들어 올리고, 이어지는 장면에서 파란 블록 위에 노란 블록이 보여요.',
  action: '아이가 고른 놀이를 잠시 지켜보세요. 어떤 물건과 움직임을 반복하는지 살핀 뒤 도움을 요청하거나 놀이가 멈출 때 곁에서 반응해 주세요.',
  reason: '놀이를 이끄는 아이의 행동을 먼저 관찰하면 무엇에 관심을 두는지 보고 개입할 시점을 정할 수 있어요.',
  sourceId: 'NURI-OBSERVE-PLAY',
  sourceTitle: '2019 개정 누리과정 놀이실행자료',
  sourcePublisher: '교육부·보건복지부',
  sourceUrl: 'https://i-nuri.go.kr/teacher/board/view.do?board_idx=376&manage_idx=25&menu_idx=19',
  sourceSection: '「놀이지원을 위해 관찰한다」, 45–46쪽 (3–5세)',
};

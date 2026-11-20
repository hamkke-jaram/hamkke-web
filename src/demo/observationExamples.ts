import type { AiObservation, EvidenceRecommendation } from '../api/types';
import { blockPlayEvidence, blockPlayObservation } from './blockPlayExample';
import blockVideo from './teacher-review/media/block-play.mp4';
import blockPoster from './teacher-review/media/block-play.jpg';
import throwVideo from './teacher-review/media/throw-and-shout.mp4';
import throwPoster from './teacher-review/media/throw-and-shout.jpg';

export type ObservationExampleId = 'block-play' | 'throw-and-shout';

type ObservationExample = {
  label: string;
  video: string;
  poster: string;
  observation: AiObservation;
  evidence: EvidenceRecommendation;
  audioCue?: { start: number; label: string; credit: string; sourceUrl: string };
};

export const observationExamples = {
  'block-play': {
    label: '블록 쌓기',
    video: blockVideo,
    poster: blockPoster,
    observation: blockPlayObservation,
    evidence: blockPlayEvidence,
  },
  'throw-and-shout': {
    label: '장난감 던지기와 큰 소리',
    video: throwVideo,
    poster: throwPoster,
    observation: {
      id: -1, source: 'HOME', modelVersion: 'illustrated-example', recordedAt: '', createdAt: '',
      peopleCount: -1, childStates: [], adultResponses: [],
      summary: '캐릭터가 한 손에 쥔 장난감을 던지고, 장난감이 매트에 떨어져요. 그 뒤 영상에서 큰 소리가 한 차례 들려요.',
      moments: [
        { t: 1.4, note: '캐릭터가 청록색 장난감을 한 손으로 들어요.' },
        { t: 2.5, note: '캐릭터가 팔을 앞으로 움직여 장난감을 던져요.' },
        { t: 3.4, note: '장난감이 매트에 떨어져요.' },
        { t: 5.0, note: '장난감은 매트에 놓여 있고 캐릭터는 그 자리에 서 있어요.' },
      ],
    },
    audioCue: {
      start: 5,
      label: '0:05–0:06 · 큰 소리가 한 차례 들려요.',
      credit: '음원 출처 · marc3122 · Male Screams [1] · CC0 1.0',
      sourceUrl: 'https://freesound.org/people/marc3122/sounds/556976/',
    },
    evidence: {
      observation: '손에서 떠난 장난감이 매트에 떨어져요.',
      action: '장난감이 떨어진 자리와 주변 사람의 위치를 살펴보세요. 부딪힐 수 있는 물건이 가까이 있다면 치우고 놀이할 공간을 마련해 주세요.',
      reason: '교육부 표준보육과정은 안전한 환경에서 놀이하고 위험한 상황에 대처하는 경험을 제시해요. 장난감이 날아간 구역을 먼저 확인하는 방법은 그 원칙을 이 장면에 적용한 예예요.',
      sourceId: 'MOE-CARE-2024-SAFE-PLAY',
      sourceTitle: '표준보육과정 고시 (교육부고시 제2024-23호)',
      sourcePublisher: '교육부',
      sourceUrl: 'https://www.law.go.kr/LSW/flDownload.do?bylClsCd=&flSeq=146173277',
      sourceSection: '제3장 2세 보육과정 · 신체운동·건강 · 안전하게 생활하기',
    },
  },
} satisfies Record<ObservationExampleId, ObservationExample>;

export function observationExample(id: ObservationExampleId): ObservationExample {
  return observationExamples[id];
}

import { useId, useRef, useState } from 'react';
import type { Role } from '../api/types';
import { TextAreaField, useToast } from './feedback';
import './conversationSuggestions.css';

type Topic = 'daily' | 'play' | 'support' | 'note';
type Suggestion = { topic: Topic; label: string; text: string };

const SUGGESTIONS: Record<Role, readonly Suggestion[]> = {
  PARENT: [
    {
      topic: 'daily',
      label: '기관에서의 모습',
      text: '선생님, 요즘 아이가 기관에서 먼저 고르거나 오래 즐기는 놀이가 있나요? 기억나는 장면이 있다면 듣고 싶어요.',
    },
    {
      topic: 'play',
      label: '집에서 이어가기',
      text: '기관에서 즐기는 놀이를 집에서도 해보고 싶어요. 집에서 함께 해볼 만한 활동 한 가지를 알려주실 수 있을까요?',
    },
    {
      topic: 'support',
      label: '도움 방법 맞추기',
      text: '아이가 새 활동을 시작할 때 기관에서는 어떤 말이나 몸짓으로 알려주시나요? 집에서도 같은 방법을 써 보고 싶어요.',
    },
    {
      topic: 'note',
      label: '메모에 대해 묻기',
      text: '남겨주신 메모를 읽었어요. 어떤 상황에서 그 모습이 보였는지 조금 더 알려주실 수 있을까요?',
    },
  ],
  TEACHER: [
    {
      topic: 'daily',
      label: '가정에서의 모습',
      text: '가정에서 아이가 먼저 골라 하는 놀이나 자주 찾는 물건이 있나요? 알려주시면 기관 활동에 참고할게요.',
    },
    {
      topic: 'play',
      label: '같은 놀이 이어가기',
      text: '기관과 가정에서 함께 해볼 놀이를 정해 보고 싶어요. 아이가 요즘 즐기는 활동이 있다면 알려주세요.',
    },
    {
      topic: 'support',
      label: '도움 방법 맞추기',
      text: '아이가 새 활동을 시작할 때 집에서는 어떤 말이나 몸짓으로 알려주시나요? 편하게 참여할 수 있도록 기관에서도 참고하고 싶어요.',
    },
  ],
};

type Props = {
  role: Role;
  hasNotes?: boolean;
  onAddToNote?: (text: string) => void;
  noteBusy?: boolean;
  onAddToMessage?: (text: string) => void;
  messageSpace?: number;
};

export default function ConversationSuggestions({ role, hasNotes, onAddToNote, noteBusy, onAddToMessage, messageSpace = 500 }: Props) {
  const [selected, setSelected] = useState<Topic>('daily');
  const [edits, setEdits] = useState<Partial<Record<Topic, string>>>({});
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const toast = useToast();
  const choices = SUGGESTIONS[role].filter(({ topic }) => topic !== 'note' || hasNotes);
  const suggestion = choices.find(({ topic }) => topic === selected) ?? choices[0]!;
  const draft = edits[suggestion.topic] ?? suggestion.text;

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft.trim());
      toast('문장을 복사했어요.');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      toast('자동으로 복사하지 못했어요. 선택한 문장을 직접 복사해 주세요.');
    }
  }

  return (
    <details ref={panel} className="conversation-suggestions">
      <summary>대화 문장 추천</summary>
      <div className="conversation-suggestions-body">
        <div className="conversation-suggestions-topics" role="group" aria-label="대화 주제">
          {choices.map(({ topic, label }) => (
            <button
              key={topic}
              type="button"
              className="btn ghost"
              aria-pressed={suggestion.topic === topic}
              onClick={() => setSelected(topic)}
            >
              {label}
            </button>
          ))}
        </div>
        <TextAreaField
          id={inputId}
          ref={inputRef}
          label="추천 문장"
          hint="내 상황에 맞게 고쳐 쓸 수 있어요."
          rows={4}
          maxLength={onAddToMessage ? 500 : 1000}
          value={draft}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setEdits((previous) => ({ ...previous, [suggestion.topic]: text }));
          }}
        />
        <div className="conversation-suggestions-actions">
          {onAddToMessage && (
            <button type="button" className="btn" disabled={noteBusy || !draft.trim() || draft.trim().length > messageSpace}
              onClick={() => {
                onAddToMessage(draft.trim());
                if (panel.current) panel.current.open = false;
              }}>
              이야기 초안에 추가
            </button>
          )}
          {onAddToNote && (
            <button type="button" className="btn" disabled={noteBusy || !draft.trim()} onClick={() => onAddToNote(draft.trim())}>
              메모 끝에 추가
            </button>
          )}
          <button type="button" className="btn ghost" disabled={!draft.trim()} onClick={() => void copyDraft()}>
            문장 복사
          </button>
        </div>
      </div>
    </details>
  );
}

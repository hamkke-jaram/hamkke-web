import { formatDuration } from '../../components/ui';
import { WEEKDAYS, shortDate, type ThisWeek } from './week';

/**
 * 아이 홈 '주간 기록'의 이번 주 모습(시안: 기간, '함께한 시간' | '기록한 영상', 요일 막대).
 * 숫자는 이번 주에 찍은 영상의 기록을 더한 것이다. 점수나 평가가 아니고, 다른 아이와 견주지 않는다.
 * 막대는 꾸밈이 아니라 정보라서 같은 값을 글(aria-label)로도 전한다.
 */
export default function WeekCard({ week }: { week: ThisWeek }) {
  const max = Math.max(...week.days, 0);
  const spoken = week.days.map((sec, i) => `${WEEKDAYS[i]}요일 ${sec > 0 ? formatDuration(sec) : '없음'}`).join(', ');
  return (
    <div className="wk">
      <p className="wk-period">
        {shortDate(week.start)} – {shortDate(week.end)}
      </p>
      <dl className="wk-stats">
        <div>
          <dt>함께한 시간</dt>
          <dd>{formatDuration(week.totalSeconds)}</dd>
        </div>
        <div>
          <dt>기록한 영상</dt>
          <dd>{week.count}개</dd>
        </div>
      </dl>
      <div className="wk-bars" role="img" aria-label={`이번 주 요일별 함께한 시간. ${spoken}`}>
        {week.days.map((sec, i) => (
          <div key={WEEKDAYS[i]} className="wk-col">
            <div className="wk-track">
              {sec > 0 && (
                <span
                  className={i === week.todayIndex ? 'wk-bar today' : 'wk-bar'}
                  // 가장 긴 날을 꽉 채우고 나머지는 비율대로. 아주 짧은 날도 막대가 보이게 바닥을 둔다.
                  style={{ height: `${Math.max(12, Math.round((sec / max) * 100))}%` }}
                />
              )}
            </div>
            <span className={i === week.todayIndex ? 'wk-day today' : 'wk-day'}>{WEEKDAYS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

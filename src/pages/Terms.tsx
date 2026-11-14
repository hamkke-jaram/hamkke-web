import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BackLink } from '../components/feedback';

/** 서비스 이용약관 요약(가입·다시 동의 화면의 '자세히'). 전문은 운영 공지로 함께 알린다. */
export default function Terms() {
  const { policies } = useAuth();
  return (
    <div>
      <BackLink />
      <h1>서비스 이용약관</h1>
      <p className="lead">함께자람을 쓰실 때 알아 두실 약속을 짧게 모았어요.</p>

      <section className="card">
        <h2>어떤 서비스인가요</h2>
        <ul>
          <li>
            함께자람은 보호자와 기관 선생님이 아이와 함께한 시간을 기록하고, 놀이 아이디어(코칭 카드)를 받아 보는 개인
            건강관리(웰니스) 서비스예요.
          </li>
          <li>의료기기가 아니며 아이의 발달 상태를 판단하지 않아요. 걱정되는 점은 전문가와 상담해 주세요.</li>
          <li>숫자와 AI 관찰 기록은 같은 집의 변화를 보기 위한 참고 기록이에요. 다른 아이와 비교하지 않아요.</li>
        </ul>
      </section>

      <section className="card">
        <h2>계정과 아이 정보</h2>
        <ul>
          <li>계정은 본인만 써 주세요. 비밀번호는 내 정보에서 언제든 바꿀 수 있어요.</li>
          <li>아이 정보는 법정대리인(보호자)이 동의한 경우에만 등록할 수 있어요.</li>
          <li>선생님은 보호자가 초대 코드로 연결하고 공유를 켠 항목만 볼 수 있어요.</li>
        </ul>
      </section>

      <section className="card">
        <h2>내 데이터</h2>
        <ul>
          <li>내 정보에서 내 데이터를 파일로 내려받을 수 있어요.</li>
          <li>아이 정보 삭제나 회원 탈퇴를 하면 관련 기록이 즉시 지워져요.</li>
          <li>
            자세한 내용은 <Link to="/privacy">개인정보 처리 안내</Link>를 봐 주세요.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>약관이 바뀌면</h2>
        <p style={{ marginBottom: 0 }}>
          약관이나 개인정보 처리 방침이 바뀌면 다음에 앱을 열 때 바뀐 내용을 알려 드리고 다시 동의를 받아요.
        </p>
      </section>
      <p className="muted">문서 버전 {policies?.termsVersion ?? '불러오는 중'} (요약)</p>
    </div>
  );
}

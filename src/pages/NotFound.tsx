import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import EmptyState from '../components/EmptyState';

function useHome() {
  const { user } = useAuth();
  return user ? (user.role === 'PARENT' ? '/p' : '/t') : '/';
}

/** 없는 주소로 들어왔을 때. */
export default function NotFound() {
  const home = useHome();
  return (
    <EmptyState
      mascot="dome"
      title="찾으시는 화면이 없어요"
      titleAs="h1"
      action={
        <Link to={home} className="btn block">
          처음 화면으로
        </Link>
      }
    >
      주소가 바뀌었거나 없어진 화면이에요.
    </EmptyState>
  );
}

function BrokenScreen() {
  const home = useHome();
  return (
    <EmptyState
      mascot="friend"
      title="화면을 보여 드리지 못했어요"
      titleAs="h1"
      action={
        <>
          <button type="button" className="btn block" onClick={() => window.location.reload()}>
            새로 고침
          </button>
          <a href={home} className="btn block secondary">
            처음 화면으로
          </a>
        </>
      }
    >
      잠시 뒤에 다시 시도해 주세요.
    </EmptyState>
  );
}

/**
 * 화면을 그리다 오류가 나면 흰 화면 대신 안내를 보인다.
 * 오류 내용에는 기록 문장이 섞일 수 있어 콘솔·저장소에 따로 남기지 않는다.
 * 주소가 바뀌면(resetKey) 다시 그려 본다.
 */
export class ScreenErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <BrokenScreen /> : this.props.children;
  }
}

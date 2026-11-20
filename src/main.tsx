import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { installServerOrigins } from './api/origin';
import { ToastProvider } from './components/feedback';
import { initTheme } from './theme';
import { initMotion } from './motion';
// Pretendard(자체 호스팅): 글자 묶음별로 나뉜 woff2를 필요한 것만 내려받는다. 외부 CDN은 쓰지 않는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';

// 안드로이드 앱 빌드에서만: /api·/ai 요청을 빌드 때 정한 서버 주소로 보낸다(웹에서는 아무 일도 하지 않는다).
installServerOrigins();

// 화면 설정(밝기·고대비·움직이는 캐릭터)을 그리기 전에 적용해 깜빡이지 않게 한다.
initTheme();
initMotion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

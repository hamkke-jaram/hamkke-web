import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/feedback';
import { initTheme } from './theme';
import { initMotion } from './motion';
import { AuthProvider } from './auth/AuthContext';
import { DemoProvider } from './demo/DemoContext';
// Pretendard(자체 호스팅): 글자 묶음별로 나뉜 woff2를 필요한 것만 내려받는다. 외부 CDN은 쓰지 않는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';

// 화면 설정(밝기·고대비·움직이는 캐릭터)을 그리기 전에 적용해 깜빡이지 않게 한다.
initTheme();
initMotion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DemoProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </DemoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

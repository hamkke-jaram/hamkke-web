import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/feedback';
import { initTheme } from './theme';
import { AuthProvider } from './auth/AuthContext';
import { DemoProvider } from './demo/DemoContext';
import './styles.css';

// 화면 설정(밝기·고대비)을 그리기 전에 적용해 깜빡이지 않게 한다.
initTheme();

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

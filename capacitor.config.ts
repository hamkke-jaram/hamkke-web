import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱 껍데기(Capacitor) 설정. 웹 배포(nginx·vite)와는 상관없다.
 * 앱은 dist/ 를 기기 안에 담아 https://localhost 로 연다.
 */
const config: CapacitorConfig = {
  appId: 'kr.hamkkejaram.app',
  appName: '함께자람',
  webDir: 'dist',
  // 요청·응답 내용(비밀번호, 토큰, 관찰 문장)이 기기 로그(logcat)에 찍히지 않게, 디버그 빌드에서도 Capacitor 로그를 끈다.
  loggingBehavior: 'none',
  plugins: {
    // fetch 를 네이티브로 보낸다. 앱의 출처(https://localhost)에서 서버(다른 출처, 개발 때는 http)로 가는 요청이
    // 브라우저의 교차 출처·혼합 콘텐츠 규칙에 걸리지 않는다. 서버 주소는 빌드 때 VITE_API_ORIGIN·VITE_AI_ORIGIN 으로 정한다(src/api/origin.ts).
    CapacitorHttp: { enabled: true },
    // 상태바·아래 손짓 줄: 화면을 그 안쪽에 그리고(여백은 Capacitor가 잡는다), 아이콘 색은 기기의 밝게/어둡게를 따른다.
    // 상태바 뒤 색은 android 의 app_bg(밝을 때 흰색 → 어두운 아이콘).
    SystemBars: { insetsHandling: 'css', style: 'DEFAULT' },
  },
};

export default config;

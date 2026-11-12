# hamkke-web — 함께자람 모바일 웹

부모 앱과 교사 화면(React 18 · TypeScript · Vite, PWA). 영상 분석은 [hamkke-ai](https://github.com/hamkke-jaram/hamkke-ai) 패키지로 **폰 브라우저 안에서** 하고, 서버([hamkke-api](https://github.com/hamkke-jaram/hamkke-api))에는 지표 JSON만 보낸다.

> 본 서비스는 의료기기가 아니며 발달 상태를 판단하지 않습니다. 걱정되는 점은 전문의와 상담하세요.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173 (/api → http://localhost:8080 프록시, 처음에 분석 모델 약 6MB 내려받음)
```

백엔드는 hamkke-api에서 `./gradlew bootRun`. 카메라 촬영은 HTTPS 또는 localhost에서만 동작한다.

## 검사

```bash
npm run typecheck
npm run build
node scripts/check-expressions.mjs   # 금지 표현 검수
```

`/support` 상담·기관 안내는 서버에 닿지 못해도(점검·오프라인) `src/support/fallback.ts`의 내장 목록을 바로 보여 준다. hamkke-api의 `V3__seed_support_resources.sql`을 바꾸면 이 파일도 함께 바꾼다.

## 화면

| 사용자 | 경로 |
|---|---|
| 공통 | `/` 소개 · `/signup` · `/login` · `/support` 상담·기관 안내(로그인 불필요) · `/privacy` · `/account` |
| 부모 | `/p` · `/p/children/new`(법정대리인 동의) · `/p/children/:id`(주간 요약·코칭·선생님 이야기) · `/p/children/:id/record`(촬영·분석) · `/p/children/:id/share`(공유·초대 코드) |
| 교사 | `/t`(초대 코드 연결) · `/t/children/:id`(공유된 요약·목표·관찰 메모) |

## 배포

`Dockerfile`(nginx, CSP·HSTS·본문 64KB 제한 포함)은 hamkke-api의 `deploy/docker-compose.yml`에서 함께 빌드된다.
배포 절차는 hamkke-api의 `docs/deploy.md`를 본다. nginx가 맨 앞단이라는 전제로 `X-Forwarded-For`를 실제 접속 주소(`$remote_addr`)로 덮어쓴다. nginx 앞에 다른 프록시를 두면 이 설정을 함께 손봐야 한다. 분석 모델(`public/mediapipe`)은 이미지 빌드 중 다시 받으므로 `.dockerignore`에서 뺀다.

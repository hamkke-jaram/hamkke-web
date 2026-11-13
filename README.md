# hamkke-web — 함께자람 모바일 웹

부모 앱과 기관 선생님 화면(React 18 · TypeScript · Vite, PWA). 영상 분석은 [hamkke-ai](https://github.com/hamkke-jaram/hamkke-ai) 패키지로 **폰 브라우저 안에서** 하고, 서버([hamkke-api](https://github.com/hamkke-jaram/hamkke-api))에는 지표 JSON만 보낸다. 영상 원본과 소리는 기기 밖으로 나가지 않는다.
보호자가 아이별로 **AI 관찰 기록**에 동의한 경우에만 장면 사진 최대 6장을 AI 서버(hamkke-ai `server/`)로 보내 관찰 기록(글)을 만든다. 아래 [AI 관찰 기록](#ai-관찰-기록) 참고.

> 본 서비스는 의료기기가 아니며 발달 상태를 판단하지 않습니다. 걱정되는 점은 전문의와 상담하세요.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173 (/api → http://localhost:8080, /ai/ → http://localhost:8090 프록시, 처음에 분석 모델 약 6MB 내려받음)
```

백엔드는 hamkke-api에서 `./gradlew bootRun`, AI 서버는 hamkke-ai의 `server/`(8090). AI 서버가 없어도 나머지 기능은 그대로 동작한다.
실시간 카메라(`getUserMedia`)는 HTTPS 또는 localhost에서만 동작한다. 영상 파일을 골라 기록하는 화면은 http에서도 되도록, 보안 연결에서만 있는 `crypto.randomUUID()` 대신 `src/api/uuid.ts`의 `newUuid()`를 쓴다.

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
| 부모 | `/p` · `/p/children/new`(법정대리인 동의) · `/p/children/:id`(주간 요약·코칭·선생님 이야기·AI 관찰 기록) · `/p/children/:id/record`(촬영·분석) · `/p/children/:id/observe`(실시간 카메라) · `/p/children/:id/share`(공유·초대 코드) |
| 기관 선생님 | `/t`(초대 코드 연결) · `/t/children/:id`(공유된 요약·목표·관찰 메모·AI 관찰 기록) · `/t/children/:id/observe`(기관에서 관찰 기록하기) |

## AI 관찰 기록

약속은 hamkke-api의 `docs/ai-observation.md`에 있다. 웹이 하는 일은 `src/ai/`에 모여 있다.

| 파일 | 하는 일 |
|---|---|
| `frames.ts` | 장면 사진 뽑기. 영상 파일(`sampleFramesFromFile`: 처음·끝 5%를 뺀 구간에서 고르게 6장)과 실시간 카메라(`captureFrame`). 긴 변 512px 이하 JPEG, 한 장 300KB 이하·본문 전체 2MB 이하가 되도록 화질·크기를 낮춘다 |
| `aiClient.ts` | `createObservation`: ① `POST /api/v1/children/{id}/ai-sessions`(분석 토큰) → ② `POST /ai/v1/analyze`(Bearer 분석 토큰 + 사진, 제한 200초) → ③ `POST /api/v1/children/{id}/ai-observations`(영수증만). ③만 실패하면 영수증을 메모리에 들고 있다가 `resumeSave`로 저장만 다시 한다(아래 '저장 단계의 실패') |
| `useObservationRun.ts` · `ObservationRunStatus.tsx` | 만들기 한 번의 진행·멈춤·실패 상태(`ObservationRun`: 화면과 떨어져 있어 그대로 시험한다)와 그 화면 |
| `Observe.tsx` | 실시간 카메라 화면. 카메라 고르기(앞·뒤, 연결된 카메라), 30초·1분·2분 동안 6장 |
| `AiConsentCard.tsx` | 아이별 동의 켜기·끄기(끄면 그 아이의 AI 관찰 기록이 모두 지워진다) |
| `ObservationCard.tsx` · `ObservationList.tsx` · `labels.ts` | 관찰 기록 한 건·목록, 태그 → 화면 문구 |
| `ai.css` | 위 화면의 스타일(`styles.css`의 색 변수만 쓴다. 고대비용 `--edge`는 없어도 되게 대체값을 둔다) |

지키는 것:

- **동의 없이는 한 장도 보내지 않는다.** 화면에서는 `GET /children/{id}/ai-consent`로 확인하고, 서버는 분석 토큰을 줄 때 다시 확인한다. `GET /policies`의 `aiObservationEnabled`가 `false`면 새로 만드는 화면(켜기, 촬영 버튼, 영상 기록 뒤의 관찰 기록 만들기)을 모두 숨긴다. 다만 이미 동의해 둔 아이는 그동안 쌓인 기록을 보고 지우거나 동의를 끌 수 있어야 하므로, 켜진 동의 카드와 목록은 남긴다(선생님 화면도 이미 있는 기록은 보여 준다).
- **사진은 `/ai/` 경로로만 간다.** `/api`에는 글자(영수증)만 보낸다. AI 서버에는 로그인 토큰이 아니라 분석 토큰만 보낸다. 사진·토큰·관찰 문장은 콘솔이나 브라우저 저장소에 남기지 않는다.
- **영상은 녹화·저장하지 않는다.** 실시간 카메라는 `audio: false`로 열고, 다 찍거나 멈추거나 화면을 떠나거나 가리면 모든 트랙을 멈춘다. 촬영 중에는 '지금 장면 사진을 찍고 있어요 (n/6)' 표시가 계속 보인다.
- **AI가 실패해도 지표 기록은 남는다.** 기록 화면에서는 지표 3개를 저장한 뒤에 관찰 기록을 만들고, 실패하면 안내와 '다시 시도'만 보여 준다.
- 기관 선생님에게는 보호자가 '기관에서 촬영해 관찰 기록 남기기'를 켠 아이에만 촬영 버튼이 보인다.

저장 단계의 실패(`aiClient.ts`의 `save`):

| 서버 응답 | 하는 일 |
|---|---|
| 응답 없음, 502·503·504 | 같은 영수증으로 2번 더 보낸다. 그래도 안 되면 영수증을 실어 알리고, '다시 시도'는 저장만 다시 한다(분석 토큰을 새로 받지 않고 사진도 다시 보내지 않는다. 영수증을 받은 지 14분이 지나면 처음부터 다시 한다) |
| 429, 500, 503 `AI_UNAVAILABLE` | 바로 되풀이하지 않고 영수증을 실어 알린다(다시 시도 = 저장만) |
| 409 `DUPLICATE_REQUEST` | 앞선 요청이 저장된 것이다. 목록에서 방금 기록(과 가정 기록이면 함께 전달된 카드)을 찾아 성공으로 보여 준다. 찾지 못하면 실패가 아니라 '저장했어요' 안내를 보여 준다 |
| 400 `VALIDATION_FAILED` (촬영 시각을 보냈을 때) | 기기 시계가 서버보다 많이 빠른 경우다. 촬영 시각을 빼고 한 번 더 저장한다(서버 시각으로 저장) |
| 400 `AI_RECEIPT_INVALID`, 401, 403·404, 422 `AI_CONSENT_REQUIRED`, 그 밖의 4xx | 다시 보내도 같으므로 '다시 시도'를 보여 주지 않고, 이유에 맞는 문장으로 알린다 |

시험(`npm test`)은 DOM 없이 돈다. `frames.test.ts`는 `<video>`·`<canvas>`를 흉내 낸 가짜로 크기·화질 낮추기, 찾아가기 제한 시간, 멈춤과 ObjectURL 해제를 확인한다. 실제 카메라와 영상 디코딩은 실제 기기(안드로이드 크롬, iOS 사파리)에서 따로 확인해야 한다.

### 휴대폰으로 시험하기

실시간 카메라는 보안 연결이 필요해서 `http://192.168.x.x:5173` 같은 주소로는 켜지지 않는다(화면에 안내가 나온다). 개발 중에는 아래 가운데 하나를 쓴다.

- 안드로이드 + USB: `adb reverse tcp:5173 tcp:5173` 뒤 폰 크롬에서 `http://localhost:5173` (localhost라서 카메라가 켜진다).
- HTTPS 터널이나 배포 환경(HTTPS)에서 연다.
- 보안 연결이 없어도 **영상 기록하기** 화면의 '지금 촬영하기'(폰 카메라 앱으로 촬영)는 동작하고, 같은 영상에서 장면 사진을 뽑아 AI 관찰 기록을 만든다. 이 경로는 보안 연결에서만 있는 브라우저 기능(`crypto.randomUUID` 등)을 쓰지 않는다. `http://192.168.x.x:5173`으로 열려면 개발 서버를 `npm run dev -- --host`로 띄운다.

## 전체 흐름 보기 (시연 모드)

멘토·심사 시연용. 첫 화면의 **전체 흐름 보기 (시연용)** 버튼 또는 `/demo`에서 시작한다.

- 데모 보호자·아이(동의 포함)·지난 4주 예시 기록·공유 설정·데모 선생님(초대 코드 연결)·목표·관찰 메모를 공개 API로 만든 뒤, 화면 아래 안내 패널로 9단계를 넘겨 보여 준다. 보호자·선생님 계정은 단계에 맞춰 자동으로 바뀐다.
- 예시 기록은 영상 없이 넣은 숫자라 `modelVersion: demo-sample-data`로 저장된다. 영상 분석 단계에서는 직접 고른 영상을 기기 안에서 분석한다.
- **데모 끝내기**를 누르면 데모 계정 두 개와 그 기록을 모두 지운다. 데모를 만드는 중에 실패해도 이미 만든 계정을 지운다.
- 데모 진행 상태는 그 탭의 sessionStorage에 있지만, 로그인 토큰은 앱 전체가 쓰는 localStorage에 있어서 데모 중에는 같은 브라우저의 다른 탭도 데모 계정으로 보인다. 다른 탭에서 계정이 바뀌면 패널이 알려 주고, 데모 계정 토큰만 다룬다.
- 개발 서버(`npm run dev`)에서만 켜진다. 배포 빌드에서 쓰려면 `VITE_DEMO_MODE=true npm run build`.

## 배포

`Dockerfile`(nginx, CSP·HSTS·본문 64KB 제한 포함)은 hamkke-api의 `deploy/docker-compose.yml`에서 함께 빌드된다.
nginx는 `/ai/`를 AI 서버(`AI_UPSTREAM`, 기본 `ai:8090`)로 넘긴다. 이 경로만 본문 2MB·읽기 제한 200초이고, 사진이 디스크에 닿지 않게 임시 파일을 쓰지 않는다. `/api/`와 나머지는 64KB 그대로다. AI 서버 주소는 요청할 때 Docker 내장 DNS(127.0.0.11)로 찾으므로 `ai` 서비스가 없어도 nginx는 뜬다(이 경로만 502).
배포 절차는 hamkke-api의 `docs/deploy.md`를 본다. nginx가 맨 앞단이라는 전제로 `X-Forwarded-For`를 실제 접속 주소(`$remote_addr`)로 덮어쓴다. nginx 앞에 다른 프록시를 두면 이 설정을 함께 손봐야 한다. 분석 모델(`public/mediapipe`)은 이미지 빌드 중 다시 받으므로 `.dockerignore`에서 뺀다.

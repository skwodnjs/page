# Page

개인용 앱 허브. 금융 관리, 단어·문장 학습, 메모를 하나의 미니멀한 화면에서 사용할 수 있도록 구성했습니다.

## 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## Cloudflare Workers

Cloudflare Workers Builds에서 이 저장소를 연결한 뒤 다음과 같이 설정합니다.

- 빌드 명령: `npm run build`
- 배포 명령: `npx wrangler deploy`

`wrangler.jsonc`에 정적 파일 디렉터리와 SPA 라우팅이 설정돼 있습니다.

## 화면

- `/` — 앱 선택
- `/finance`, `/finance/transactions`, `/finance/accounts`
- `/learning`, `/learning/list/:id`
- `/memo`, `/memo/notes`, `/memo/notes/:id`

초기 콘텐츠가 포함되어 있으며, 화면에서 편집한 내용은 현재 브라우저의 localStorage에 저장됩니다. 계정 연동 또는 서버 데이터베이스는 연결되어 있지 않습니다.

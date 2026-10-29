# Page

개인용 React 앱 허브: 금융 관리 · 단어/문장 · 메모 · 일상.
배포는 Cloudflare Workers, 로그인과 메모·일상 데이터는 Firebase Authentication / Cloud Firestore를 사용합니다.

## 설치 및 실행

```bash
npm install
npm run dev
npm run build
```

## 중요: 관리자 설정 (설정 전에는 앱 접근 불가)

1. Firebase Console의 Authentication > Sign-in method에서 **Google**과 **Email/Password**를 모두 활성화합니다.
2. 최초 관리자 Google 계정의 **이메일 주소**를 확정합니다. 이 주소를 아래 환경변수에 설정하지 않으면 로그인 화면만 표시되고 인증을 시작할 수 없습니다.
3. 로컬 개발은 저장소 루트에 `.env.local` 생성:

```dotenv
VITE_OWNER_EMAIL=you@gmail.com
# OPTIONAL: UID를 이미 알고 있다면 클라이언트에서도 추가 검증합니다.
VITE_OWNER_UID=
```

4. Cloudflare Worker Builds에서도 빌드 환경변수 `VITE_OWNER_EMAIL`을 **동일하게 설정하고 재배포**합니다. `VITE_*` 값은 클라이언트 번들에 포함되므로 비밀번호나 서비스 계정 키를 입력하지 않습니다.
5. Firebase Authentication > Settings > Authorized domains에 실제 웹사이트 도메인을 등록합니다.
6. 앱 잠금 화면의 **최초 설정 · 비밀번호 재설정 (Google)**을 눌러 위 이메일의 Google 계정으로 인증한 후 **6자 이상의 비밀번호**를 등록합니다. 처음에는 기존 Email/Password Firebase 사용자를 별도로 만들지 마세요. Google Firebase 계정에 비밀번호 인증을 연결하므로 UID가 유지됩니다.
   - 이메일 주소 열거 방지가 켜진 새 Firebase 프로젝트에서도 동작하도록 SDK의 `linkWithCredential()`이 아닌 **`accounts:signUp` REST API + Google 사용자의 ID 토큰**으로 같은 UID에 이메일/비밀번호를 연결합니다. 이 보안 설정을 해제하지 마세요.
7. 이후에는 **비밀번호만 입력**하면 됩니다. 로그아웃은 화면 상단 잠금 버튼. Firebase Auth는 `browserSessionPersistence`를 사용해 탭/창 세션이 끝나면 해제됩니다. Google 계정을 사용한 비밀번호 재설정 후 다시 비밀번호로 잠금 해제해야 합니다.

### 필수: Firestore 보안 규칙 배포

**GitHub에 규칙 파일을 올리는 것만으로는 Firebase에 적용되지 않습니다.**

1. 최초 Google 인증 후 Firebase Console > Authentication > Users에서 **관리자 UID**를 복사합니다.
2. 저장소 [`firestore.rules`](firestore.rules)의 `REPLACE_WITH_OWNER_UID`를 복사한 UID로 변경합니다.
3. Firebase Console > Firestore Database > Rules에 규칙을 붙여넣고 **게시(Publish)**를 누릅니다. Google 설정 단계 이전에 규칙을 게시해도 되지만, 플레이스홀더는 모든 요청을 차단하므로 관리자 UID로 치환해야 메모를 읽고 쓸 수 있습니다.
4. 원한다면 Cloudflare 빌드 환경변수 `VITE_OWNER_UID`에도 동일 UID를 추가하면 프런트엔드에서 별도 확인이 가능합니다. **실제 권한 통제는 반드시 서버의 Firestore Rules로 수행**해야 합니다.

보안 규칙은 `users/{uid}/datedNotes/{date}`, `users/{uid}/generalNotes/{noteId}`, `users/{uid}/dailyRecords/{date}` 경로를 관리자 Firebase UID에만 허용합니다. 다른 경로는 접근 거부입니다. 공개 쓰기 규칙을 사용하지 마세요.

## 메모 데이터

- 날짜별 메모: 문서 ID는 `YYYY-MM-DD`, 필드 `date`, `content`, `updatedAt`.
- 전체 메모: Firestore 자동 생성 문서 ID, 필드 `title`, `body`, `updatedAt`.
- 입력 즉시 화면 반영, 마지막 입력 2초 뒤 저장, Firebase 서버 응답 이후에만 `저장됨` 표시.
- 저장 실패 시 `재시도` 표시, 작성 중 초안은 `localStorage`에 일시 백업하고 서버 저장 성공 후 삭제.
- Firestore 기본 **메모리 캐시** 사용: 브라우저 영구 오프라인 Firestore 캐시는 사용하지 않습니다. 공개 기기에서는 브라우저 자체의 로컬 데이터도 정리해야 합니다.
- 기존 `page-ui-dated`/`page-ui-notes`가 있으면 메모 화면에서 **기존 메모 가져오기**를 선택할 수 있습니다. UI 예시 메모가 포함되었을 수 있으므로 자동 업로드하지 않습니다.
- 여러 기기에서 같은 메모를 동시에 편집할 경우 Firestore의 마지막 저장 내용이 우선합니다. 중요한 동시 편집에는 별도의 충돌 해결 기능이 필요합니다.
- Firebase 설정은 공개 웹 앱 구성이고, 관리자 비밀번호는 코드/환경변수에 절대 포함하지 않습니다.

## 일상 기록 (Firestore)

- 문서 경로: `users/{uid}/dailyRecords/{YYYY-MM-DD}` (사용자가 로그인한 Firebase UID 아래에 날짜별로 한 문서).
- 주요 필드: `date` (`YYYY-MM-DD`), `checkInAt`, `checkOutAt` (각 UTC 기준 ISO 8601 문자열 또는 `null`), `timeline` (활동 배열), `updatedAt`. 화면의 출퇴근 시각, 익일 여부, 근무 시간은 두 시각에서 계산합니다.
- 타임라인 항목: `id`, `title`, `note`, `startAt`, `endAt` (현지 시간 `YYYY-MM-DDTHH:mm`). 출퇴근 기록이 없는 날도 타임라인만 저장할 수 있습니다.
- 달력·월간 합계·날짜별 기록은 Firestore 실시간 구독(`onSnapshot`)으로 동기화합니다. 출근/퇴근 버튼과 편집, 타임라인 추가/수정/삭제는 `setDoc(...,{merge:true})`로 저장합니다. 저장 완료 안내는 Firestore 작업 성공 후에만 표시됩니다.
- **기존 UI에 포함된 출퇴근·타임라인 예시 데이터는 서버에 업로드하지 않고 제거했습니다.** 빈 Firebase 문서는 실제로 기록하기 전까지 비어 있습니다. 일상 페이지에서 `localStorage` 또는 브라우저 영구 Firestore 캐시를 사용하지 않습니다.
- 같은 날짜의 타임라인을 여러 기기에서 동시에 수정하면 마지막으로 저장한 배열이 우선합니다. 출퇴근 필드는 병합 저장합니다.
- **이전 형식의 문서는 자동 변환하지 않습니다.** 기존 `dailyRecords` 문서는 사용자가 Firestore Console에서 직접 삭제한 다음 사용하세요. 이전 문서가 남아 있으면 이전 필드가 Firestore에 남을 수 있습니다. 일상 페이지 코드는 새 구조만 읽고 씁니다.
- **중요: Firestore 보안 규칙도 따로 업데이트해야 합니다.** 이미 실제 UID를 적용해 Firebase에 게시한 기존 규칙을 유지하면서 아래 `dailyRecords` 구문을 `match /databases/{database}/documents` 내부에 추가하고 **Firebase Console > Firestore Database > Rules > Publish**를 누르세요:

```javascript
match /users/{userId}/dailyRecords/{dateId} {
  allow read, write: if isOwner(userId);
}
```

저장소 `firestore.rules`에 있는 `REPLACE_WITH_OWNER_UID`는 예시 플레이스홀더입니다. **게시할 때 실제 관리자 UID로 유지/교체해야 합니다.** 기존 공개 접근 규칙으로 우회하거나 보안 검증을 제거하지 마세요.

## 아직 Firebase가 아닌 화면

**금융 관리, 학습, 투자 UI 데이터는 이전과 같이 브라우저 `localStorage` 기반이며 실제 서버 데이터가 아닙니다.** 인증 후에만 UI를 렌더링하지만, 이미 브라우저에 저장된 로컬 데이터를 암호화하거나 Firebase로 이전하지는 않습니다. 해당 기능은 다음 단계에서 별도로 구현해야 합니다.

## 배포

Cloudflare Workers Builds에서:

- 빌드 명령: `npm run build`
- 배포 명령: `npx wrangler deploy`

`wrangler.jsonc`에 정적 파일 디렉터리와 SPA 라우팅이 설정되어 있습니다.

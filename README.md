# 이사 플래너

여러 사람이 D-day를 중심으로 이사 준비를 함께 관리하는 한국어 웹 앱입니다.

## 실행

```bash
pnpm install
pnpm dev
```

기본값은 **로컬 전용 모드**입니다. 데이터는 현재 기기의 현재 브라우저 LocalStorage에만 저장되고, 서버는 `127.0.0.1`로만 열리므로 다른 사람은 접근하거나 참여할 수 없습니다.

## 외부 배포 및 공동 편집 설정

1. Supabase 프로젝트의 SQL Editor에서 [`supabase/schema.sql`](./supabase/schema.sql)을 실행합니다.
2. `.env.example`을 `.env.local`로 복사하고 아래 값을 채웁니다.

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_ENABLE_COLLABORATION=true
ADMIN_PASSWORD=CHANGE_TO_A_STRONG_PASSWORD
```

3. Vercel의 Production 환경 변수에도 같은 값을 등록한 뒤 배포합니다. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 비밀값이므로 절대 `NEXT_PUBLIC_` 접두사를 붙이거나 Git에 커밋하지 않습니다.
4. 배포 주소로 접속해 생성한 계획의 `초대 링크 복사`를 전달합니다. 링크 토큰을 가진 사람만 서버 API를 통해 그 계획을 조회·편집할 수 있습니다. 동기화는 4초 간격으로 반영됩니다.

> v1은 링크를 아는 모든 사람이 편집하는 모델입니다. 링크를 받은 사람은 편집할 수 있으므로, 민감한 개인정보는 입력하지 마세요.

## 관리자 모드

Vercel에 `ADMIN_PASSWORD`를 서버 환경변수로 등록하고 재배포한 뒤 `/admin`에서 로그인하면 Supabase에 저장된 계획을 개별 또는 전체 삭제할 수 있습니다. 비밀번호는 코드나 `NEXT_PUBLIC_` 환경변수에 넣지 마세요.

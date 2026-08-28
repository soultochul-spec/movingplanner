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
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
ADMIN_PASSWORD=CHANGE_TO_A_STRONG_PASSWORD
```

3. Vercel의 Production 환경 변수에도 같은 값을 등록한 뒤 배포합니다. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 비밀값이므로 절대 `NEXT_PUBLIC_` 접두사를 붙이거나 Git에 커밋하지 않습니다.
4. 배포 주소로 접속해 생성한 계획의 `초대 링크 복사`를 전달합니다. 링크 토큰을 가진 사람만 서버 API를 통해 그 계획을 조회·편집할 수 있습니다. 동기화는 4초 간격으로 반영됩니다.

5. 로그인 기반 기기 간 동기화를 사용하려면 [`supabase/auth-migration.sql`](./supabase/auth-migration.sql)을 실행하고 Supabase Authentication의 URL Configuration에 배포 주소를 등록합니다. Google 로그인은 Supabase의 Google provider도 활성화해야 합니다.

> v1은 링크를 아는 모든 사람이 편집하는 모델입니다. 링크를 받은 사람은 편집할 수 있으므로, 민감한 개인정보는 입력하지 마세요.

## 관리자 모드

Vercel에 `ADMIN_PASSWORD`를 서버 환경변수로 등록하고 재배포한 뒤 `/admin`에서 로그인하면 Supabase에 저장된 계획을 개별 또는 전체 삭제할 수 있습니다. 비밀번호는 코드나 `NEXT_PUBLIC_` 환경변수에 넣지 마세요.

## 일반 모드의 대표와 참여자 삭제

기존 Supabase 프로젝트에는 [`supabase/representative-migration.sql`](./supabase/representative-migration.sql)을 SQL Editor에서 한 번 실행합니다. 새 프로젝트도 `schema.sql` 실행 후 이 파일을 실행해야 합니다. 기존 데이터는 삭제하지 않으며 재실행할 수 있습니다. 먼저 적용 후 이 버전을 배포하는 것을 권장합니다. DB 적용 전에는 대표 기능을 비활성화하고 기존 이름 등록을 유지합니다.

- 계획 작성자가 본인 계정으로 이름을 등록하면 첫 대표가 됩니다. 과거에 등록된 이름은 계정과 자동 연결하지 않으므로 처음 한 번 본인 이름을 다시 등록해야 합니다. 이전 중복 이름은 대표가 삭제할 수 있습니다.
- `참여자 관리`에서 대표는 본인 계정으로 참여한 다른 사람에게 대표를 넘길 수 있습니다. 이름만 대신 등록한 사람에게는 권한을 줄 수 없습니다.
- 현재 대표만 일반 모드에서 참여자를 삭제합니다. 대표 자신을 삭제하려면 먼저 대표를 넘겨야 합니다. 할 일과 완료 기록은 유지하고 담당자 배정만 해제합니다.
- 대표가 관리자에 의해 삭제되면 계획 작성자가 새 대표를 지정할 수 있습니다. 소유자가 없는 과거 계획은 관리자가 소유자를 확인해 설정해야 합니다. 링크 방문만으로 소유권을 가져오지 않습니다.
- 참여자 삭제는 계정 삭제나 접속 차단이 아닙니다. 초대 링크와 로그인 계정이 있는 사람은 다시 참여할 수 있습니다.
- 대표 판별은 서버가 검증한 Supabase 로그인 ID를 사용합니다. 변경·삭제는 DB에서 계획 행을 잠근 후 권한을 확인해 한 트랜잭션으로 처리합니다. 클라이언트에서 임의의 계정 ID나 이름을 제출해 권한을 얻을 수 없습니다.

`pnpm test`는 운영 DB와 분리된 메모리 PostgreSQL(PGlite)에서 대표 지정/이양, 무권한 삭제 차단, 담당자 해제, 기존 완료 기록 보존, 관리자 삭제 후 재지정, 로컬 모드 정책을 검증합니다.

# BibleOn Supabase Free 적용 계획

작성: 2026-09-04 KST  
범위: 인증, 개인 동기화, 교회, 친구, 메시지/QT, 알림, 파일, RAG 연계

## 구현 현황

- [x] Supabase JS 클라이언트와 환경변수 경계
- [x] 공통 로컬 저장소와 계정 repository
- [x] 이메일·Apple·Google·Kakao Auth 호출 및 Naver custom provider 연결점
- [x] 프로필·사용자 설정·기기·마이그레이션 기록 테이블과 RLS migration
- [x] 기존 로컬 프로필/설정의 일회성 계정 가져오기
- [x] 메인 앱의 프로필·기본 번역·다크모드 설정 지연 동기화
- [x] 실제 Supabase 프로젝트 연결과 원격 migration 적용
- [ ] OAuth 공급자 콘솔의 callback/secret 설정
- [x] 읽음·메모·강조용 IndexedDB outbox와 서버 테이블
- [x] 교회·친구·메시지·Storage 단계
- [ ] RAG API와 검색 인덱스 단계

프로젝트 URL과 publishable key는 Git에서 제외된 `.env.local`에 설정되어 있다. 환경변수가
없는 개발 환경에서는 기존 게스트 미리보기로, 설정된 환경에서는 Supabase 계정 모드로 작동한다.

## 1. 결론

BibleOn의 초기 배포는 **Supabase를 계정 및 공유 데이터의 원본(source of truth)으로 두고,
기기 저장소를 오프라인 캐시로 사용하는 방식**이 가장 적합하다.

DB가 필요한지 판단하는 기준은 단순히 "여러 사람이 함께 쓰는가"가 아니다. 아래 중 하나라도
해당하면 계정 소유 데이터이므로 서버 DB에 원본을 둔다.

- 기기를 바꿔도 복구되어야 한다.
- 로그아웃 후 다시 로그인했을 때 유지되어야 한다.
- 다른 사용자나 교회와 공유된다.
- 권한, 차단, 삭제, 감사 기록을 서버가 강제해야 한다.
- 통계나 추천 계산에 서버 데이터가 필요하다.

반대로 정적 공개 데이터, 일시적인 화면 상태, 다시 만들 수 있는 캐시는 DB에 넣지 않는다.
현재 `localStorage`는 프로토타입 저장소로만 보고, Supabase 적용 후에는 작은 UI 설정과 동기화
커서만 남긴다.

이 문서는 `docs/SERVER_DESIGN.md`의 초기 커스텀 서버 구상 중 MVP 인프라 선택을 대체한다.
초기에는 별도 Fastify·Redis 서버를 운영하지 않고 Supabase 중심으로 출시하며, 기존 문서의
도메인 경계와 권한 원칙은 유지한다. 사용량이나 기능이 Supabase 범위를 넘을 때만 모듈 단위로
별도 서버를 분리한다.

## 2. Supabase Free의 역할

| Supabase 기능 | BibleOn에서의 역할 |
| --- | --- |
| Auth | 이메일, Apple, Google, Kakao 로그인과 세션 관리 |
| Postgres | 사용자·교회·채팅·개인 동기화 데이터의 원본 |
| Realtime | 현재 열린 채팅방과 사용자 알림의 실시간 갱신 |
| Storage | 프로필사진, 교회사진, 채팅 첨부파일 |
| Edge Functions | 푸시 발송, 비밀키가 필요한 작업, RAG 호출, Naver 로그인 연계 후보 |
| pgvector | Free 용량을 확인한 뒤 제한된 RAG 검색 인덱스에만 사용 |

Kakao, Apple, Google은 Supabase Auth가 공식 지원한다. Naver는 기본 제공 목록에 없으므로
Custom OAuth/OIDC 호환 여부를 검증한 뒤 연결하고, 맞지 않으면 Edge Function 또는 별도 인증
브리지에서 토큰을 검증한다.

## 3. 데이터 배치

### 3.1 서버 DB가 반드시 필요한 데이터

| 영역 | 데이터 | 이유 |
| --- | --- | --- |
| 계정 | 프로필, 고유 닉네임, 표시 이름, 약관 동의, 계정 상태 | 중복 방지, 복구, 권한 |
| 교회 | 등록 교회, 가입 신청, 회원, 관리자/부서 관리자, 부서 트리 | 다중 사용자 공유와 서버 권한 |
| 친구 | 친구 신청, 수락, 차단, 삭제 | 양쪽 사용자 간 일관성 |
| 교회 콘텐츠 | 공지, 예배 준비, 담당 목회자, 공개 범위 | 공동체 공유와 역할별 노출 |
| 메시지/QT | 대화방, 참여자, 메시지, 읽음 커서, 공감, 전송 취소 | 실시간 공유와 참여 시점 권한 |
| 알림 | 알림함, 읽음/삭제 상태, 알림 설정, 기기 토큰 | 기기 간 동기화와 푸시 |
| 인기 말씀 | 날짜별 구절 집계 | 모든 사용자의 집계 결과 |
| 운영 | 신고, 제재, 감사 로그, 삭제 요청 | 보안과 운영 이력 |

### 3.2 개인 데이터지만 계정 DB에 저장할 데이터

이 영역은 다른 사용자와 공유되지 않더라도 계정에 귀속된다. **Supabase가 원본이고
IndexedDB/향후 모바일 SQLite가 로컬 복제본**이 된다.

| 영역 | 서버 저장 방식 | 로컬 역할 |
| --- | --- | --- |
| 읽음 상태 | 사용자별 압축 비트맵과 회차·진도 | 즉시 표시, 오프라인 변경 대기 |
| 일별 읽기 기록 | 하루 단위 집계 | 히트맵 즉시 렌더링 |
| 최근 읽은 성경 | 최대 10개 참조 | 빠른 홈/성경 탭 표시 |
| 메모 | 작성된 절만 희소 행으로 저장 | 오프라인 작성 및 검색 캐시 |
| 강조/즐겨찾기 | 설정된 절만 희소 행으로 저장 | 즉시 스타일 적용 |
| 통독 회차·업적 | 회차와 획득 업적 | 프로필 즉시 표시 |
| 로드맵 | 선택 로드맵과 일별 완료 상태 | 오프라인 진행 |
| 대표 말씀·대표 업적 | 프로필 행 또는 연결 테이블 | 프로필 캐시 |
| RAG 대화 기록 | 대화방·질문·답변·출처 참조 | 최근 대화 캐시 |
| 사용자 설정 | 기본 번역, 알림, 테마 방식, 시간대 | 앱 시작 즉시 적용 |

읽은 절을 한 행씩 영구 저장하면 사용자 한 명당 약 3만 행이 생긴다. Free 단계에서는
`reading_states.read_bitmap bytea` 한 행으로 현재 회차를 압축하고, 최근 오프라인 변경만
`reading_mutations`에 30일 동안 보관한다. 일별 통계는 별도 집계 행으로 남긴다. 메모와 강조는
사용자가 실제로 작성한 절만 저장하므로 일반 행 구조가 적합하다.

### 3.3 DB에 넣지 않을 데이터

| 데이터 | 저장 위치 | 비고 |
| --- | --- | --- |
| 개역개정·새번역 전문 | 앱 패키지 또는 버전형 정적 파일 + IndexedDB/SQLite | 매 실행마다 DB 조회 금지 |
| 책/장/절 기본 목록 | 앱 번들 | 번역 버전 매니페스트만 서버 확인 가능 |
| OpenBible 원본, STEPBible 원본 | RAG 빌드 입력 저장소 | 사용자 앱 DB와 분리 |
| 현재 탭, 열린 팝업, 스크롤 위치 | 메모리 또는 기기 저장소 | 계정 동기화 불필요 |
| 입력 중 검색어·전송 전 임시문 | 기기 저장소 | 명시적 전송 전 서버 업로드 금지 |
| 애니메이션 상태, Wheel 위치 | 메모리 | 재생성 가능 |
| 내려받은 메시지 페이지·공지 | IndexedDB/SQLite 캐시 | 서버에서 다시 받을 수 있음 |
| 미전송 오프라인 작업 | 로컬 outbox | 전송 성공 후 제거 |

성경 본문은 앱 최초 설치/실행 중 한 번 내려받아 검증한 뒤 기기에 보관한다. 파일 키는
`translation + content_version + checksum`으로 구성한다. 앱 시작 시 로컬 패키지를 먼저 열고,
백그라운드에서 매니페스트만 확인한다. 모바일 앱은 가능하면 본문을 앱 자산으로 포함해
Supabase 전송량을 쓰지 않는다. 웹/PWA에서 별도 다운로드가 필요하면 버전형 정적 파일을
한 번 받아 IndexedDB에 저장한다. 라이선스가 공개 URL을 허용하지 않으면 private Storage와
짧은 signed URL을 사용한다.

## 4. 권장 테이블 구조

### 계정과 개인 데이터

- `profiles`: `id = auth.users.id`, 고유 닉네임, 표시 이름, 사진 경로, 대표 말씀·업적
- `user_preferences`: 기본 번역, 테마 방식, 지정 시간, 시간대, 알림 설정
- `device_installations`: 기기 ID, push token, 마지막 접속 시각
- `reading_cycles`: 통독 회차, 시작/완료 시각, 재달성 가능 상태
- `reading_states`: 회차별 읽음 비트맵, 읽은 절 수, 동기화 버전
- `reading_mutations`: 오프라인 작업 ID와 짧은 중복 방지 보존 기간
- `reading_daily_stats`: 날짜별 새로 읽은 절 수와 누적 수
- `verse_annotations`: 메모·강조·즐겨찾기, 버전, 삭제 tombstone
- `recent_passages`: 사용자별 최대 10개
- `user_achievements`, `roadmap_progress`

### 교회와 관계

- `churches`, `church_profiles`
- `church_memberships`: `pending/active/rejected/suspended/left`
- `departments`: `parent_id` 인접 목록, 최대 깊이 5를 DB 함수로 강제
- `department_memberships`, `membership_roles`
- `friendships`: 사용자 쌍을 정규화하고 한 행만 허용
- `user_blocks`
- `church_notices`, `worship_services`, `worship_passages`, `worship_songs`

### 채팅, QT, 알림

- `conversations`: `direct/group/qt`
- `conversation_members`: `joined_sequence`, `last_read_sequence`, 알림·즐겨찾기 설정
- `messages`: 방별 증가 `sequence`, 일반/말씀/서버 메시지, `revoked_at`
- `message_reactions`: 사용자·메시지·공감 종류 unique
- `message_hidden_by_user`: 나에게만 삭제
- `message_attachments`: Storage 객체 참조와 크기·MIME
- `notifications`: 목적지 종류와 목적지 ID, 읽음·보관 시각

새 단체방 참여자는 `joined_sequence` 이후 메시지만 읽게 한다. 읽음 여부는 메시지마다 사용자
행을 만들지 않고 참여자의 `last_read_sequence`로 계산한다. 이 두 설계가 Free DB 용량을 크게
줄인다.

## 5. 보안과 RLS

노출되는 모든 테이블에 RLS를 켜고 권한을 다음처럼 강제한다.

- 개인 데이터: `auth.uid() = user_id`인 행만 읽기·수정 가능
- 교회 데이터: 활성 `church_memberships`가 존재해야 열람 가능
- 관리자 기능: DB의 현재 역할을 조회한다. 클라이언트가 보낸 관리자 문자열은 신뢰하지 않는다.
- 부서 관리자: 관리 부서와 하위 부서 범위만 허용하고 교회 설정은 거부한다.
- 채팅: `conversation_members`에 존재하며 `joined_sequence` 조건을 통과한 메시지만 열람 가능
- Storage: `users/{user_id}`, `churches/{church_id}`, `conversations/{conversation_id}` 경로별 RLS
- Realtime: public channel을 끄고 `conversation:{id}`, `user:{id}` private topic만 사용
- `service`/secret key: 앱에 절대 포함하지 않고 Edge Function 또는 신뢰 서버에서만 사용

교회 소속, QT, 메모와 대화는 민감도가 높은 데이터로 보고 공개 프로필과 개인 데이터의
SELECT 정책을 분리한다. 동일 교회가 아닌 친구에게 부서·직책을 숨기는 규칙도 UI가 아니라
DB 응답 단계에서 적용한다.

## 6. 로컬 우선 동기화

### 저장소 역할

- `localStorage`: Supabase 세션, 테마의 즉시 적용값, 마지막 동기화 커서처럼 작은 값만 저장
- `IndexedDB`(현재 웹): 성경 패키지, 메시지 캐시, 개인 데이터 복제본, 오프라인 outbox
- `SQLite`(향후 모바일): IndexedDB와 동일한 repository 인터페이스 구현
- Supabase: 로그인 사용자의 최종 원본

### 동기화 순서

1. 앱은 로컬 캐시로 즉시 화면을 그린다.
2. 로그인 세션을 복원한다.
3. 로컬 outbox의 각 작업을 UUID `mutation_id`와 함께 전송한다.
4. 서버는 이미 처리한 mutation을 중복 적용하지 않는다.
5. 마지막 cursor 이후 서버 변경분만 내려받는다.
6. 성공한 outbox를 지우고 로컬 복제본을 갱신한다.

충돌 정책은 데이터마다 다르게 둔다.

- 메모: `version` 기반 충돌 감지. 두 기기에서 모두 수정했다면 한쪽을 덮어쓰지 않고 복구본 보존
- 강조·최근 성경·설정: 서버 시각 기준 last-write-wins
- 읽음 상태: 같은 회차에서는 절 단위 최종 작업을 반영하고 `read_count`를 서버에서 계산
- 메시지·교회 권한·업적: 서버만 확정
- 삭제: 다른 기기가 확인할 수 있도록 일정 기간 tombstone 유지

### 기존 localStorage 사용자 마이그레이션

로그인 직후 한 번만 기존 데이터를 읽어 `migration_batch_id`와 함께 업로드한다. 서버의
`client_migrations` 테이블에 완료 ID를 기록해 재시도해도 중복 생성되지 않게 한다. 서버에 더
새로운 데이터가 있으면 덮어쓰지 않는다. 로그아웃 시 성경 정적 캐시는 유지하고 개인 캐시와
토큰은 제거한다.

## 7. Free 플랜 용량 운영선

2026-09-04 확인 기준 Free에는 500MB DB, 1GB Storage, 월 5GB 일반 egress와 5GB cached
egress, 50,000 MAU, 2백만 Realtime 메시지, 200 peak Realtime 연결, 500,000 Edge Function
호출이 포함된다. DB가 500MB를 넘으면 read-only가 될 수 있으며, Free 프로젝트는 활동이
적으면 7일 뒤 일시 중지될 수 있다. 자동 백업도 제공되지 않는다.

BibleOn의 내부 경고선은 공식 한도보다 낮게 둔다.

| 자원 | 내부 경고선 | 운영 방법 |
| --- | --- | --- |
| DB | 350MB | 300MB부터 주간 점검, 큰 로그·벡터 확장 중지 |
| Storage | 750MB | 이미지 압축, 첨부 제한, 고아 파일 정리 |
| 일반 egress | 월 3.5GB | 성경 전문을 Supabase에서 반복 전송하지 않음 |
| cached egress | 월 3.5GB | 버전형 정적 자산과 긴 cache-control 사용 |
| Realtime 연결 | 140 | 사용자 알림 + 현재 열린 방만 구독, 백그라운드에서 해제 |
| Realtime 메시지 | 월 140만 | 타이핑 이벤트 제한, Presence 최소화 |
| Edge Functions | 월 35만 | 일반 CRUD는 Data API/RPC, 비밀 작업만 Function 사용 |

채팅 첨부는 초기 Free 단계에서 이미지 3MB, 일반 파일 10MB, 음성 8MB 정도로 제한하고
사용자·교회별 quota를 둔다. 사용자가 보존을 기대하는 파일은 고지 없이 자동 삭제하지 않는다.

### RAG 용량 주의

현재 논의한 구절별 다중 벡터를 그대로 넣으면 500MB를 빠르게 소진하고 HNSW 인덱스가 추가
공간을 사용한다. 초기에는 운영 DB에 RAG 예산을 최대 80~100MB로 제한하고 다음 순서로
측정한다.

1. 문단/소제목 단위 청크와 작은 차원의 embedding으로 실제 테이블·인덱스 크기를 측정한다.
2. 원문, OpenBible 관계, 관주 그래프는 텍스트 중복 대신 ID와 edge로 저장한다.
3. 여러 표현의 원문 전체를 DB 행에 반복하지 않고 source object와 canonical ID를 참조한다.
4. 100MB를 넘으면 운영 DB를 압박하지 말고 RAG 전용 서비스/프로젝트로 분리한다.

두 번째 Supabase 프로젝트로 분리하면 Auth JWT와 RLS를 그대로 공유할 수 없으므로 앱이 RAG
프로젝트에 직접 연결하지 않는다. 앱은 주 프로젝트의 Edge Function 또는 서버 API를 호출하고,
그 서버만 RAG 저장소에 접근한다.

## 8. 백업과 Free의 한계

Free에는 자동 DB 백업이 없으므로 실제 사용자 데이터를 받기 전 외부 백업이 필수다.

- 최소 매일 `supabase db dump` 또는 `pg_dump` 실행
- Storage 객체 목록과 파일도 별도 비공개 저장소로 복제
- 월 1회 복원 연습
- 마이그레이션 SQL은 Git에 보관
- DB·Storage·egress·Realtime 사용량 주간 기록

Free는 내부 테스트와 소규모 베타에는 적합하지만, 복구 보장과 무중단 운영이 필요한 정식
서비스 단계에서는 Pro 전환을 운영 조건으로 본다. Pro 전환을 대비해 Supabase API와 테이블
구조는 그대로 유지하므로 일반적으로 앱 코드 재작성은 필요하지 않다.

## 9. 구현 순서

### 0단계: 경계 만들기

- `@supabase/supabase-js`와 환경변수 구성
- 컴포넌트의 직접 `localStorage` 호출을 `repositories` 계층 뒤로 이동
- `LocalRepository`와 `SupabaseRepository` 인터페이스 정의
- Supabase CLI migration과 seed 구조 생성

### 1단계: Auth와 프로필

- 이메일, Google, Kakao 우선 연결
- Apple 설정과 이름 수집 onboarding 처리
- Naver custom OAuth/OIDC 기술 검증
- `profiles`, `user_preferences`, 닉네임 unique 제약과 RLS

### 2단계: 개인 데이터 동기화

- 읽음 비트맵, 메모, 강조, 최근 성경, 업적, 로드맵
- IndexedDB 캐시와 outbox
- 기존 localStorage 일회성 가져오기와 충돌 테스트

### 3단계: 교회와 친구

- 등록 교회 검색, 가입 신청, 역할, 부서 트리
- 관리자 위임, 탈퇴 제한, 부서 범위 RLS
- 친구·차단과 프로필 공개 범위

### 4단계: 메시지/QT/알림

- 대화방과 메시지 영속화
- private Realtime 구독, 읽음 cursor, 참여 시점 이후 공개
- QT 서버 메시지, 말씀 전달, 공감, 나에게만 삭제/전송 취소
- 알림함과 목적지 이동, push token

### 5단계: Storage

- 프로필·교회 사진 업로드와 압축
- 대화방별 private 첨부파일 RLS
- 파일 quota, MIME 검사, 고아 파일 정리

### 6단계: RAG 연계

- Edge Function/서버에서만 모델·RAG 비밀키 사용
- pgvector 실제 크기와 검색 품질 벤치마크
- 운영 DB 100MB 예산 초과 시 분리

### 7단계: 출시 점검

- RLS 자동 테스트와 권한 침범 테스트
- 오프라인/다중 기기/충돌/재로그인 테스트
- 외부 백업과 복원 훈련
- quota 대시보드와 Pro 전환 기준 확정

## 10. Pro 전환 기준

다음 중 하나에 도달하면 즉시 Pro 전환을 검토한다.

- DB 350MB 또는 Storage 750MB
- 월 egress 70%
- Realtime peak 140 또는 메시지 140만 건
- Free 프로젝트 pause가 서비스 신뢰성에 영향을 주기 시작함
- 베타가 끝나고 복구 보장이 필요한 실제 사용자 데이터를 받음

## 11. 현재 저장 경로 감사와 전환 안전장치

2026-09-04 코드 감사 기준 `bibleon.*` 로컬 키는 36개다. 현재 원격 동기화가 구현된 것은
프로필과 기본 번역·다크모드 설정뿐이며, 나머지 기능 대부분은 아직 로컬 전용이다. 따라서
현재 상태를 실제 다중 계정 서비스로 배포하면 안 된다.

### 확인된 위험

- 로컬 키가 `user_id`로 분리되지 않아 같은 브라우저에서 계정을 바꾸면 이전 사용자의 메모,
  읽음, 대화 등이 다음 사용자에게 보일 수 있다.
- `account-foundation-v1` 가져오기도 전역 `bibleon.personalProfile`을 읽으므로, 계정 전환 전
  캐시 정리가 없으면 다른 사용자의 프로필을 새 계정에 이관할 수 있다.
- 원격 저장 실패를 현재 UI가 표시하거나 outbox에서 재시도하지 않아, 사용자는 동기화됐다고
  생각하지만 실제로는 로컬에만 남는 상황이 생길 수 있다.
- 사용자·교회 프로필 이미지는 현재 base64 data URL로 localStorage에 저장된다. Supabase
  Storage는 아직 연결되지 않았으며, 계정 repository는 이 값을 의도적으로 원격에서 제외한다.
- 교회 대화/QT, 친구·차단, 교회 역할·부서·공지·예배와 인기 말씀 집계는 모두 로컬 전용이다.
  이 데이터는 계정 캐시가 아니라 서버 공유 DB가 원본이어야 한다.
- 성경 전문이 Cache API에 저장되는 것은 의도한 동작이며 서버 DB 이관 대상이 아니다.

### 물리적 저장소와 논리적 소유권

`계정 DB`와 `서버 DB`는 서로 다른 Supabase 데이터베이스가 아니다. 하나의 Postgres 안에서
소유권과 RLS가 다른 논리 영역이다.

- 계정 DB 영역: `user_id = auth.uid()`로 소유자가 한 명인 개인 데이터
- 서버 공유 DB 영역: 교회, 대화방, 친구 관계처럼 여러 사용자가 접근하되 membership RLS가
  적용되는 데이터
- 서버 Storage: 실제 파일 객체. DB에는 파일 경로, 소유자, 크기와 MIME만 저장
- 로컬 캐시: 위 원본의 기기 복제본. 계정별 namespace와 sync cursor가 반드시 존재

### 반드시 추가할 안전장치

1. `localStore`를 UI에서 직접 import하지 못하게 하고 `DeviceCache`, `AccountRepository`,
   `CommunityRepository`, `MediaRepository`, `BibleContentRepository`를 통해서만 저장한다.
2. 모든 로컬 계정 캐시 키를 `bibleon.account.{user_id}.*`로 분리한다. 로그아웃 시 개인 캐시와
   outbox는 제거하고 성경 정적 캐시만 유지한다.
3. 저장 정책 registry에 각 데이터의 `authority = device/account/shared/storage/static`을 선언하고
   등록되지 않은 새 저장 키는 테스트에서 실패시킨다.
4. ESLint/CI에서 `window.localStorage`, `localStore`, Supabase client의 컴포넌트 직접 사용을
   금지한다. 각 접근은 허용된 infrastructure/repository 디렉터리에서만 가능하게 한다.
5. 원격 mutation은 먼저 계정별 outbox에 기록하고 성공 응답 후 완료 처리한다. 실패·충돌·재시도
   상태를 사용자에게 표시한다.
6. 두 계정 전환, 두 기기 동시 수정, 오프라인 재접속, RLS 침범, Storage 경로 위조를 자동
   테스트의 필수 시나리오로 둔다.

다음 구현은 기능별 서버 테이블보다 먼저 위 저장 정책 registry, 사용자별 cache namespace,
직접 저장 금지 검사를 적용해야 한다. 그래야 이후 기능 추가 과정에서 새 데이터가 무심코
전역 localStorage에 남는 일을 구조적으로 막을 수 있다.

### 2026-09-04 안전장치 구현 결과

- UI의 기존 저장 호출은 `persistenceRepository`가 정책을 판정한 뒤 `AccountCache`,
  `CommunityRepository`, `DeviceCache`로 전달한다. 성경 본문과 미디어도 각각
  `BibleContentRepository`, `MediaRepository` 경계를 사용한다.
- 로컬 계정·공유 캐시는 로그인 상태에서 `bibleon.account.{user_id}.*`, 비로그인 상태에서
  `bibleon.guest.{installation_id}.*`로 분리된다. 로그아웃 repository는 해당 사용자의 개인·공유
  캐시와 IndexedDB outbox만 지우며 Cache API의 성경 본문은 유지한다.
- 기존 전역 개인 데이터는 설치별 게스트 공간으로 옮긴다. 로그인 후 명시적 확인을 거쳐야만
  계정 공간에 합쳐진다. 읽음은 합집합, 메모 충돌은 별도 복구 목록, 객체형 기록은 계정값
  우선으로 병합한다.
- 기존 전역 교회·친구·대화·QT·권한·공지 같은 공유 데이터는 이전하지 않고 즉시 폐기한다.
  서버가 확정하지 않은 프로토타입 공유 상태를 실제 계정 데이터로 승격시키지 않는다.
- 지원 중인 원격 mutation인 프로필·환경설정·온보딩은 사용자별 IndexedDB outbox에 먼저
  기록한다. 성공 시 제거하고 실패 시 오류와 시도 횟수를 보존하며, 온라인 복귀 시 자동으로
  재시도한다. 설정 화면에서 저장·대기·실패 상태를 확인할 수 있다.
- `npm run check:persistence`는 UI의 직접 localStorage/Supabase 사용과 미등록 `bibleon.*` 키를
  실패시킨다. `npm test`는 계정 전환, 기기별 분리, 동시 메모 충돌, 오프라인 재접속, RLS SQL
  계약과 Storage 경로 위조를 검사한다.
- Storage private bucket과 avatar 소유자 경로 정책 migration은 작성했다. 교회 미디어와 메시지
  첨부는 membership 테이블이 생기기 전까지 정책을 열지 않아 기본 거부 상태를 유지한다.
- 현재 Supabase 프로젝트 환경값이 없어 SQL을 원격에 적용하거나 실제 인증 토큰으로 RLS를
  공격하는 통합 테스트는 실행하지 않았다. 현재 테스트는 코드·SQL 계약 수준이며, 프로젝트
  연결 직후 별도 통합 테스트를 추가해야 한다.

## 공식 참고 자료

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Kakao login](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Custom OAuth/OIDC Providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)

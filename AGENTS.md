# 무역놀이 앱 수정 지침

이 프로젝트를 수정하는 AI와 개발자는 다음 규칙을 지켜야 합니다.

## 게임의 핵심 구조

- 하나의 게임방에 6개 국가가 참여합니다.
- 교사는 6자리 교사 코드, 학생은 국가별 4자리 모둠 코드로 접속합니다.
- 학생은 자기 국가만 조작할 수 있습니다.
- 거래는 상대 국가가 수락해야 완료됩니다.
- 현금 거래와 물물교환을 모두 지원합니다.
- 여러 기기는 약 1.5초마다 서버 상태를 동기화합니다.
- 참가자에게 ChatGPT 계정이나 Google 계정을 요구하지 않습니다.

## 반드시 유지할 규칙

- 프로그램 내부 화폐 `1`은 `1만원`입니다.
- 화면 표시 함수는 내부 값을 그대로 만원 단위로 표시합니다.
- 기술은 1단계부터 순서대로 구매합니다.
- 거래 수락 시 양쪽 국가의 돈과 자원을 다시 검사합니다.
- 학생 요청만 믿지 말고 모든 권한과 재고를 API에서 검증합니다.
- 모둠 코드는 해당 국가만 조작할 수 있어야 합니다.
- 기존 데이터베이스 마이그레이션은 수정하거나 삭제하지 않습니다. 변경 시 새 마이그레이션을 추가합니다.

## Vercel 배포 구조

- 프로덕션 빌드는 Vercel 네이티브 Next.js(`next build`)를 사용합니다.
- 프로덕션 상태 저장은 Upstash Redis REST API를 사용합니다.
- 저장소 접근은 `lib/upstash-rest.ts`에서만 처리합니다.
- Vercel Marketplace의 `KV_REST_API_URL`과 `KV_REST_API_TOKEN`을 최우선으로 사용합니다.
- 표준 Upstash 변수 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`도 허용합니다.
- Vercel Marketplace가 접두사를 붙여 생성한 `*_KV_REST_API_URL`, `*_KV_REST_API_TOKEN` 쌍도 자동 탐지합니다.
- 게임방 전체 상태는 하나의 Redis 문서로 저장하고 `version` 기반 CAS(compare-and-set)로 동시 요청 충돌을 막습니다.
- Redis 인증 토큰을 클라이언트 코드 또는 `NEXT_PUBLIC_*` 환경 변수에 노출하지 않습니다.
- 기존 Cloudflare/D1 파일과 마이그레이션은 기록 보존을 위해 삭제하지 않습니다. Vercel 빌드에서는 사용하지 않습니다.

## 주요 수정 위치

- 화면과 입력 항목: `app/trade-game.tsx`
- 국가·산업 단계·권한·거래 검증: `app/api/game/route.ts`
- Vercel Redis 저장소: `lib/upstash-rest.ts`
- 색상과 배치: `app/globals.css`
- 기존 D1 데이터 구조(보존용): `db/schema.ts`, `drizzle/`

국가와 산업 단계는 화면 파일과 API 파일 양쪽에 정의되어 있습니다. 한쪽을 변경하면 다른 쪽도 동일하게 변경해야 합니다.

## 수정 후 확인

1. `npm ci`
2. `npm run build`
3. Vercel 프로젝트에 Upstash Redis 환경 변수가 연결되었는지 확인합니다.
4. 현금 거래, 물물교환, 수락, 거절, 기술 구매를 확인합니다.
5. 두 브라우저 이상에서 약 1.5초 동기화를 확인합니다.

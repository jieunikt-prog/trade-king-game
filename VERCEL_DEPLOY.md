# Vercel 배포 안내

이 버전은 Vercel 네이티브 Next.js 빌드(`next build`)를 사용합니다.
게임 상태 저장은 Cloudflare D1 대신 Upstash Redis REST API를 사용합니다.

## 1. Vercel 프로젝트 만들기

GitHub 저장소를 Vercel에서 Import 합니다. Framework Preset은 **Next.js**로 두고,
Build Command / Output Directory는 Override 하지 않는 것을 권장합니다.

- Build Command: `npm run build` (자동 감지)
- Output Directory: 비워 두기 (Next.js 기본 `.next` 사용)
- Node.js: 22.x 권장

## 2. Upstash Redis 연결

Vercel 프로젝트의 **Storage / Marketplace**에서 Upstash Redis를 연결합니다.
연결 시 다음 환경 변수가 자동으로 들어오도록 합니다.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

코드는 이전 Vercel KV 호환 변수도 인식합니다.

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

환경 변수를 연결한 뒤 반드시 Redeploy 하세요.

## 3. 유지되는 기능

- 방 코드 + 교사/모둠 코드 방식, 별도 계정 불필요
- 학생은 자기 국가만 조작 가능
- 약 1.5초 주기 실시간 상태 동기화
- 현금 거래 / 물물교환
- 거래 수락 / 거절
- 거래 수락 시 양쪽 재고와 현금을 서버에서 재검사
- 동시 요청 시 버전 기반 CAS로 충돌 방지
- 돈 1 = 1만원

## 4. 이전 Cloudflare 파일

기존 D1 마이그레이션과 Cloudflare 관련 파일은 기록/호환을 위해 삭제하지 않았습니다.
Vercel 빌드에서는 `next build`가 사용되므로 `vite.config.ts`, `worker/`, D1 마이그레이션은 실행되지 않습니다.

## Legacy Cloudflare source
The original Cloudflare D1 runtime entry is preserved as `legacy-cloudflare/db-index.ts.txt`. It is intentionally not a `.ts` file so Vercel's Next.js type checker does not compile the Cloudflare-only `cloudflare:workers` import. Existing `db/schema.ts` and `drizzle/` migrations are preserved unchanged.


## Marketplace 자동 변수

Upstash 연결 시 Vercel이 `tradekinggame_KV_REST_API_URL`처럼 접두사가 붙은 변수를 만들 수 있습니다. 이 버전은 `*_KV_REST_API_URL`과 대응하는 `*_KV_REST_API_TOKEN` 쌍을 자동 탐지하므로 별도의 변수 복사가 필요하지 않습니다. 연결 후 Production을 Redeploy하세요.

## 저장소 연결 확인

배포 후 `https://<프로덕션-도메인>/api/storage-health`를 열어 확인합니다.

정상이면 다음과 비슷한 응답이 나옵니다.

```json
{"ok":true,"configured":true,"source":"KV_REST_API_*"}
```

이 진단 주소는 Redis URL이나 토큰 값은 노출하지 않습니다.

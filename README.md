# 우리가 무역왕

교실에서 6개 모둠이 국가를 맡아 자원을 거래하고 산업 단계를 발전시키는 실시간 무역 게임입니다.

## 핵심 기능

- 계정 없이 방 코드 + 교사/모둠 코드로 입장
- 모둠별 권한 분리: 학생은 자기 국가만 조작
- 약 1.5초 간격 실시간 상태 동기화
- 현금 거래와 물물교환
- 상대 모둠 또는 교사의 거래 수락/거절
- 거래 수락 시 서버에서 현금/재고 재검증
- 동시 작업 충돌 방지(version 기반 CAS)
- 돈 1 = 1만원

## Vercel 구조

이 버전은 Vercel에서 일반 Next.js 프로젝트로 빌드됩니다.

- 개발: `npm run dev`
- 빌드: `npm run build` → `next build`
- 실행: `npm run start`
- 상태 저장: Upstash Redis REST API

기존 Cloudflare D1 관련 파일과 마이그레이션은 삭제하지 않고 보존하지만 Vercel 프로덕션 경로에서는 사용하지 않습니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

게임방 생성/동기화를 테스트하려면 `.env.local`에 Redis REST 환경 변수가 필요합니다.

```env
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN
```

## Vercel 배포

1. GitHub 저장소를 Vercel에서 Import합니다.
2. Framework Preset은 **Next.js**로 둡니다.
3. **Build Command / Output Directory를 직접 Override하지 마세요.**
   - Build Command: 자동 감지(`npm run build`)
   - Output Directory: Next.js 기본값(`.next`)
4. 프로젝트의 Storage/Marketplace에서 **Upstash Redis**를 연결합니다.
5. 아래 변수가 Production/Preview에 설정되어 있는지 확인합니다.
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
6. 환경 변수를 연결한 뒤 Redeploy 합니다.

구형 Vercel KV 이름도 호환됩니다.

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

자세한 배포 체크리스트는 `VERCEL_DEPLOY.md`를 참고하세요.

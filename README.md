# 입어보기 — AI 가상 피팅 (prototype)

쇼핑몰 옷 상세 페이지 링크 + 내 전신샷을 올리면, **내가 그 옷을 입은 모습**을 AI가 만들어 보여주고,
원하면 **한 바퀴 도는 짧은 영상**까지 생성합니다.

## 흐름
1. **스크래핑** (`/api/scrape`, Puppeteer) — 상품 페이지에서 의상 후보 이미지 수집
2. **매칭** (`/api/match`, Claude vision) — `"파란색 치마"` 같은 프롬프트로 의상 특정. 애매하면 후보를 보여주고 사용자가 선택
3. **착용 합성** (`/api/tryon`, fal.ai **Seedream** v4.5/edit) — 전신샷 + 의상 → 착용 이미지 (얼굴·배경 유지)
4. **영상** (`/api/video/start` + `/api/video/status`, fal.ai **Seedance** lite i2v) — 큐 제출 후 클라이언트 폴링. 인물이 같은 배경에서 한 바퀴 도는 5초 클립

## 실행
```bash
npm install
npm run dev   # http://localhost:3000
```

## 환경변수 (`.env.local`)
```
FAL_API_KEY=...        # 이미지(Seedream)·영상(Seedance)
ANTHROPIC_API_KEY=...  # 의상 매칭 비전(Claude)
```
키 값은 `C:\claude\.env`에서 복사되어 있습니다.

## 스택
Next.js 16 (App Router) · React 19 · Tailwind 4 · TypeScript — boardville와 동일. 배포도 boardville처럼 Vercel 예정(현재는 로컬 검증 단계).

## 참고
- 스크래핑은 사이트마다 봇 차단 정책이 달라 일부 쇼핑몰(예: 일부 글로벌 SPA/지역 제한)에선 이미지를 못 가져올 수 있습니다. 그럴 땐 다른 링크를 사용하세요.
- 결과물은 AI 생성물이며 실제 착용과 다를 수 있습니다.

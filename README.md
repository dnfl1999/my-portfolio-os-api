# my-portfolio-os-api

Vercel 서버리스 함수만 담당하는 API 전용 프로젝트입니다.
이 프로젝트는 GitHub Pages로 배포된 My Portfolio OS 프론트와 분리되어 있으며, `/api/prices` POST 요청만 처리합니다.

## 포함 기능

- `POST /api/prices`
- `OPTIONS /api/prices`
- CORS 허용
- `PRICE_PROVIDER_MODE=example` 예시 응답 지원
- 실제 upstream 시세 API 연동용 환경변수 구조 유지
- 외부 응답을 앱 포맷으로 변환하는 mapper 포함

## 파일 구조

```text
my-portfolio-os-api
├─ api
│  ├─ _lib
│  │  └─ marketDataMapper.ts
│  └─ prices.ts
├─ .env.example
├─ .gitignore
├─ package.json
├─ README.md
├─ tsconfig.json
└─ vercel.json
```

## Vercel에 연결하는 방법

1. GitHub에 새 저장소 `my-portfolio-os-api`를 만든다.
2. 이 폴더 내용을 새 저장소에 push 한다.
3. Vercel Dashboard에서 `Add New Project`를 선택한다.
4. 방금 만든 GitHub 저장소를 import 한다.
5. Root Directory는 저장소 루트 그대로 둔다.
6. Framework Preset은 `Other` 또는 자동 감지 상태로 둔다.
7. 배포 후 `https://<your-project>.vercel.app/api/prices` 경로가 생성된다.

## 환경변수

필수 환경변수:

- `PRICE_UPSTREAM_URL`
- `PRICE_API_KEY`

선택 환경변수:

- `PRICE_PROVIDER_MODE`
- `PRICE_UPSTREAM_PATH`
- `PRICE_UPSTREAM_SYMBOLS_PARAM`
- `PRICE_API_KEY_HEADER`
- `PRICE_API_KEY_PREFIX`
- `MARKET_DATA_ALLOWED_ORIGIN`

### 환경변수 설명

- `PRICE_PROVIDER_MODE=example`
  - 외부 API 없이 예시 응답을 반환한다.
- `PRICE_UPSTREAM_URL`
  - 외부 시세 공급자 base URL
- `PRICE_UPSTREAM_PATH`
  - 기본값 `/quotes`
- `PRICE_UPSTREAM_SYMBOLS_PARAM`
  - 기본값 `symbols`
- `PRICE_API_KEY`
  - 외부 시세 API 키
- `PRICE_API_KEY_HEADER`
  - 기본값 `Authorization`
- `PRICE_API_KEY_PREFIX`
  - 기본값 `Bearer`
- `MARKET_DATA_ALLOWED_ORIGIN`
  - CORS 허용 origin. 운영 시에는 GitHub Pages 도메인으로 제한 권장

## example 모드 테스트 방법

Vercel 환경변수에 아래를 넣고 배포합니다.

```bash
PRICE_PROVIDER_MODE=example
MARKET_DATA_ALLOWED_ORIGIN=https://dnfl1999.github.io
```

그 다음 아래 요청으로 테스트합니다.

```bash
curl -X POST "https://your-project.vercel.app/api/prices" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["TLRY","PFE","NVTS"]}'
```

예상 응답 예시:

```json
{
  "prices": [
    {
      "ticker": "TLRY",
      "price": 1.82,
      "updatedAt": "2026-04-09T09:00:00.000Z",
      "currency": "USD"
    },
    {
      "ticker": "PFE",
      "price": 27.46,
      "updatedAt": "2026-04-09T09:00:00.000Z",
      "currency": "USD"
    },
    {
      "ticker": "NVTS",
      "price": 3.11,
      "updatedAt": "2026-04-09T09:00:00.000Z",
      "currency": "USD"
    }
  ]
}
```

## 실제 upstream API로 전환하는 방법

1. `PRICE_PROVIDER_MODE`를 제거한다.
2. `PRICE_UPSTREAM_URL`에 실제 공급자 base URL을 넣는다.
3. `PRICE_API_KEY`를 넣는다.
4. 공급자에 맞게 필요하면 아래를 조정한다.

```bash
PRICE_UPSTREAM_PATH=/quotes
PRICE_UPSTREAM_SYMBOLS_PARAM=symbols
PRICE_API_KEY_HEADER=Authorization
PRICE_API_KEY_PREFIX=Bearer
MARKET_DATA_ALLOWED_ORIGIN=https://dnfl1999.github.io
```

5. 재배포 후 같은 `curl` 요청으로 응답을 확인한다.
6. GitHub Pages 프론트에서는 아래처럼 API 도메인만 연결한다.

```bash
VITE_MARKET_DATA_PROVIDER=api
VITE_MARKET_DATA_API_BASE_URL=https://your-project.vercel.app
```

## Upstream 응답 매핑

`api/_lib/marketDataMapper.ts`는 아래 필드들을 읽어 앱 포맷으로 변환합니다.

- 티커: `ticker`, `symbol`, `code`
- 가격: `price`, `last`, `close`, `regularMarketPrice`, `lastPrice`
- 시각: `updatedAt`, `lastUpdatedAt`, `timestamp`, `time`, `updatedAtEpoch`, `updated_at_epoch`, `regularMarketTime`
- 통화: `currency`

예를 들어 아래 응답도 처리 가능합니다.

```json
{
  "quotes": [
    { "symbol": "TLRY", "regularMarketPrice": 1.82, "currency": "USD" },
    { "symbol": "PFE", "regularMarketPrice": 27.46, "currency": "USD" },
    { "symbol": "NVTS", "regularMarketPrice": 3.11, "currency": "USD" }
  ]
}
```

## 로컬 준비

```bash
npm install
npm run typecheck
```

# Poke Invest

포켓몬 카드·상품의 구매, 판매, 재고와 컬렉션을 사용자별로 관리하는 모바일 웹앱입니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에는 Supabase 프로젝트의 URL과 publishable key를 넣습니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

publishable key는 브라우저에서 사용하는 공개 키입니다. `service_role` 키와 Google Client Secret은 절대로 이 파일에 넣지 않습니다.

## Supabase 최초 설정

1. Supabase Dashboard의 `SQL Editor`에서
   [`supabase/migrations/202607270001_create_portfolio_snapshots.sql`](supabase/migrations/202607270001_create_portfolio_snapshots.sql)
   전체를 실행합니다.
2. `Authentication > Providers > Google`에서 Google 로그인을 활성화하고 Google Client ID와 Client Secret을 저장합니다.
3. Google Cloud의 OAuth 클라이언트 `승인된 리디렉션 URI`에는 아래 주소를 등록합니다.

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

4. Supabase `Authentication > URL Configuration`에서 다음을 설정합니다.

   - Site URL: 실제 Cloudflare Pages 주소
   - Redirect URLs: 실제 주소와 로컬 개발 주소

   ```text
   https://YOUR_SITE.pages.dev/**
   http://localhost:5173/**
   ```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

환경변수를 추가하거나 변경한 뒤에는 새 배포를 실행해야 Vite 빌드에 반영됩니다.

## 기존 장부 가져오기

기존 브라우저의 로컬 장부는 자동으로 업로드되지 않습니다. 처음 로그인한 뒤 `この端末の既存データを取り込む`을 선택해야 해당 Google 계정으로 한 번만 가져옵니다. 클라우드 저장이 성공해도 로컬 원본은 바로 삭제하지 않습니다.

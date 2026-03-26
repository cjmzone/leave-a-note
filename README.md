# Leave a Note (MVP)

Simple anonymous web app where users draw on a p5.js canvas, add a short note, and publish to a public feed.

## Tech stack
- Next.js (App Router) + TypeScript
- p5.js drawing board
- Next.js API routes for backend
- Cloudflare D1 (SQLite) + R2 (image storage)
- Tailwind CSS

## Project structure
```text
leave-a-note/
├── app/
│   ├── api/
│   │   └── posts/
│   │       └── route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── cloudflare/
│   └── schema.sql
├── components/
│   ├── DrawingBoard.tsx
│   ├── LeaveNoteForm.tsx
│   └── PostFeed.tsx
├── lib/
│   ├── cloudflareD1.ts
│   ├── constants.ts
│   ├── env.ts
│   ├── imageUpload.ts
│   ├── ip.ts
│   └── r2.ts
├── types/
│   └── post.ts
├── .env.example
├── package.json
└── README.md
```

## Database schema
`cloudflare/schema.sql` creates:

- `posts`
  - `id` (TEXT)
  - `image_url` (TEXT)
  - `note_text` (TEXT)
  - `created_at` (ISO timestamp text)
- `post_rate_limits`
  - `id` (TEXT)
  - `ip_hash` (TEXT)
  - `last_post_date` (YYYY-MM-DD text)
  - `created_at` (ISO timestamp text)

Rate limit enforcement uses a unique constraint on `(ip_hash, last_post_date)`.

## Cloudflare setup assumptions
- Cloudflare account exists.
- D1 database exists.
- R2 bucket exists.
- R2 bucket is publicly readable via `CLOUDFLARE_R2_PUBLIC_BASE_URL`.
- API token/keys have D1 query permissions and R2 read/write access.

## API endpoints
- `GET /api/posts`
  - Returns all posts in reverse chronological order.
- `POST /api/posts`
  - Body: `{ noteText: string, imageDataUrl: string }`
  - Validates note length server-side.
  - Hashes client IP and enforces one post/day.
  - Uploads canvas PNG to R2.
  - Stores post record in D1.

## Rate limiting
- IP inferred from request headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`).
- Raw IP is never stored.
- `SHA-256(ip + IP_HASH_SALT)` is stored in `post_rate_limits`.
- Daily key uses UTC date (`YYYY-MM-DD`).

## Environment variables
Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Required:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET` (default expected: `post-images`)
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`
- `IP_HASH_SALT`

## Local setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env.local`.
3. Apply schema to D1 (Wrangler example):
   ```bash
   npx wrangler d1 execute <YOUR_DB_NAME> --remote --file=cloudflare/schema.sql
   ```
   Or run SQL from `cloudflare/schema.sql` in the Cloudflare dashboard query editor.
4. Start app:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Testing
- Unit/integration (Vitest + React Testing Library):
  ```bash
  npm run test
  ```
- E2E (Playwright):
  ```bash
  npm run test:e2e
  ```
- Run everything:
  ```bash
  npm run test:all
  ```

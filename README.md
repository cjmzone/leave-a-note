# Leave a Note (MVP)

Simple anonymous web app where users draw on a p5.js canvas, add a short note, and publish to a public feed.

## Tech stack
- Next.js (App Router) + TypeScript
- p5.js drawing board
- Next.js API routes for backend
- Supabase Postgres + Storage
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
├── components/
│   ├── DrawingBoard.tsx
│   ├── LeaveNoteForm.tsx
│   └── PostFeed.tsx
├── lib/
│   ├── constants.ts
│   ├── env.ts
│   ├── ip.ts
│   └── supabaseAdmin.ts
├── supabase/
│   └── schema.sql
├── types/
│   └── post.ts
├── .env.example
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## Database schema
`supabase/schema.sql` creates:

- `posts`
  - `id` (uuid)
  - `image_url` (text)
  - `note_text` (text)
  - `created_at` (timestamptz)
- `post_rate_limits`
  - `id` (uuid)
  - `ip_hash` (text)
  - `last_post_date` (date)
  - `created_at` (timestamptz)

Rate limit enforcement uses a unique constraint on `(ip_hash, last_post_date)`.

## Supabase setup assumptions
- You have a Supabase project with Postgres enabled.
- You run `supabase/schema.sql` in the SQL Editor.
- You create a **public** Storage bucket named `post-images` (or set `SUPABASE_POST_IMAGES_BUCKET`).
- API routes use `SUPABASE_SERVICE_ROLE_KEY` server-side for DB/storage operations.
- Client remains anonymous (no auth, no accounts).

## API endpoints
- `GET /api/posts`
  - Returns all posts in reverse chronological order.
- `POST /api/posts`
  - Body: `{ noteText: string, imageDataUrl: string }`
  - Validates note length server-side.
  - Hashes client IP (with salt) and enforces one post/day.
  - Uploads canvas PNG to Supabase Storage.
  - Stores post record in `posts`.

## Rate limiting
- IP inferred from request headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`).
- Raw IP is never stored.
- `SHA-256(ip + IP_HASH_SALT)` is stored in `post_rate_limits`.
- Daily limit key uses UTC date (`YYYY-MM-DD`).

## Environment variables
Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (kept for completeness, not required by current client code)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_POST_IMAGES_BUCKET` (default: `post-images`)
- `IP_HASH_SALT` (random secret string)

## Local setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env.local`.
3. Run SQL from `supabase/schema.sql` in Supabase.
4. Create the Storage bucket.
5. Start app:
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

Test coverage includes:
- `POST /api/posts` success path, rate-limit rejection, and validation failures
- `GET /api/posts` reverse-chronological query behavior
- Hashed IP utility behavior
- Image upload abstraction behavior
- Form submit integration boundary with mocked drawing canvas
- Feed rendering and empty state
- MVP permanence assumption (no edit/delete route handlers)
# leave-a-note

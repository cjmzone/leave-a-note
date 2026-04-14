# Leave a Note

Anonymous public canvas app for quick, real-world posting.

Users arrive (often from a QR code), draw something, place text, optionally paste/upload one image, add a short note, and publish to a shared public feed with no account.

## 1. Project overview

### What the app is
Leave a Note is a lightweight anonymous “public wall” for visual notes. There is no auth flow, no profile system, and no identity UI.

### Real-world inspiration
The product is built for physical spaces where people scan a QR code and post quickly: events, cafes, pop-ups, classrooms, studios, and community boards.

### Core concept in plain English
Open the page, create a small canvas post, publish anonymously, and see it in the public feed immediately.

## 2. Current feature set

- Anonymous posting only (no accounts, no auth).
- Canvas brush drawing with p5.js.
- Canvas text placement and re-editing.
- Small curated font set for canvas text.
- Image insertion by clipboard paste, with upload fallback.
- Single inserted image per post (new image replaces previous image).
- Canvas transforms for text and image:
  - move
  - scale
  - rotate (mobile gesture support)
- Short note/caption field (required, 1-280 characters).
- Public feed rendered in reverse chronological order.
- Production rate limit: one post per IP hash per UTC day.
- Development bypass: daily rate limit check is skipped when `NODE_ENV=development`.
- Posts are permanent in the current MVP (no edit/delete endpoints).

## 3. Tech stack

### Frontend/framework
- Next.js (App Router)
- React + TypeScript
- Tailwind CSS

### Canvas/drawing implementation
- p5.js for brush strokes
- Overlay elements for text/image manipulation
- Client-side export to PNG before submit

### Backend/API
- Next.js Route Handler: `app/api/posts/route.ts`
- Node runtime for API route (`runtime = "nodejs"`)

### Cloudflare services in use
- D1 for post data and rate-limit records
- R2 for uploaded drawing image files
- Public R2 URL base for feed image rendering

### Testing stack
- Vitest (unit/integration)
- React Testing Library (component behavior)
- Playwright (e2e flows)

### Runtime assumptions
- App server can reach Cloudflare D1 API and R2 S3-compatible endpoint.
- Cloudflare credentials are available via environment variables.
- This repo currently targets real Cloudflare services (no local emulator wiring).

## 4. Local development setup

### Prerequisites
- Node.js 20+
- npm
- Existing Cloudflare account/resources (D1 database + R2 bucket)

### Install and run

```bash
npm install
cp .env.example .env.local
# fill .env.local with real values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Use `.env.example` as the template only. Keep placeholder values in `.env.example` and put real credentials in `.env.local` (gitignored).

### Test on a phone over local network

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

1. Find your machine’s LAN IP (example: `192.168.1.42`).
2. Open `http://<LAN_IP>:3000` on phone (same Wi-Fi).
3. Optionally generate a QR code to that LAN URL for real-world flow testing.

### Local gotchas
- In development, posting rate limit is intentionally bypassed.
- Placeholder env values will produce API errors with setup hints.
- Missing D1 schema causes table errors on load/post.
- Misconfigured R2 bucket or public URL breaks upload/feed image display.

## 5. Cloudflare setup

### D1
1. Create a D1 database.
2. Apply the schema file: `cloudflare/schema.sql`.

Example using Wrangler:

```bash
npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --remote --file=cloudflare/schema.sql
```

You can also run the same SQL in the Cloudflare dashboard SQL editor.

### R2
1. Create an R2 bucket (default app bucket name is `post-images`).
2. Create R2 S3-compatible access keys with read/write access to that bucket.
3. Make objects publicly reachable through one of:
   - `*.r2.dev` public URL
   - custom domain mapped to the bucket

### Required Cloudflare values
- Account ID
- API token with D1 query access
- D1 database ID
- R2 access key ID
- R2 secret access key
- R2 bucket name
- Public base URL for the bucket

### Public URL requirement
`CLOUDFLARE_R2_PUBLIC_BASE_URL` must resolve directly to object paths.  
The app stores and renders images as:

`<PUBLIC_BASE_URL>/<YYYY-MM-DD>/<uuid>.png`

## 6. Environment variables

Start from template:

```bash
cp .env.example .env.local
```

Example `.env.local` shape:

```bash
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_D1_DATABASE_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET=post-images
CLOUDFLARE_R2_PUBLIC_BASE_URL=https://<public-r2-base-url>
IP_HASH_SALT=<long-random-string>
```

| Variable | Required | Secret | Used for |
|---|---|---:|---|
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Sensitive | D1 API URL and R2 host construction |
| `CLOUDFLARE_API_TOKEN` | Yes | Yes | D1 query API authentication |
| `CLOUDFLARE_D1_DATABASE_ID` | Yes | Sensitive | Target D1 database |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Yes | Yes | R2 request signing key ID |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Yes | Yes | R2 request signing secret |
| `CLOUDFLARE_R2_BUCKET` | Optional (has fallback) | No | R2 bucket name (`post-images` fallback) |
| `CLOUDFLARE_R2_PUBLIC_BASE_URL` | Yes | No | Feed image URL base |
| `IP_HASH_SALT` | Required in production | Yes | Salt for hashed IP rate-limit storage |

Notes:
- Missing `IP_HASH_SALT` in non-production uses an insecure dev fallback with a warning.
- Do not commit real `.env.local` values.

## 7. Testing

### Typecheck

```bash
npm run typecheck
```

### Unit/integration tests

```bash
npm run test
```

### E2E tests

```bash
npm run test:e2e
```

### Mocking notes
- Unit/integration tests mock Cloudflare D1/R2-facing code where needed.
- Component tests mock canvas/p5 interactions where needed.
- Playwright tests mock `/api/posts` responses and do not require real Cloudflare resources.

## 8. Architecture notes

### Posting flow (end to end)
1. User composes content in `DrawingBoard`.
2. Client exports a PNG from canvas + overlay composition.
3. `LeaveNoteForm` sends `POST /api/posts` with `noteText` + `imageDataUrl`.
4. API validates note length and image payload.
5. API reads client IP headers, hashes IP with `IP_HASH_SALT`.
6. In production, API inserts a daily reservation row in `post_rate_limits` (unique IP hash + date).
7. API uploads the PNG to R2.
8. API inserts post metadata row into D1 `posts`.
9. Client prepends created post to feed state.

### Canvas export model (high level)
- Brush strokes are in the p5 canvas layer.
- Text and image are overlay-managed elements.
- Export draws both layers into one PNG so the feed image matches the visible composition.

### Storage/render model
- D1 `posts` table stores `id`, `image_url`, `note_text`, `created_at`.
- D1 `post_rate_limits` stores hashed IP/day reservation rows.
- `GET /api/posts` returns `created_at DESC`.
- Feed renders image + note + timestamp.

## 9. Known limitations / rough edges

- One inserted image per post (by design for now).
- No undo/redo history.
- No eraser tool; clear resets the composition.
- Mobile touch manipulation is supported, but Safari gesture feel can vary by device.
- No moderation/admin controls in this MVP.
- Posts are permanent (no edit/delete API).
- Rate limiting is IP-based, not account-based.

## 10. Roadmap / next ideas

- Add undo/redo.
- Support multiple images with explicit layer controls.
- Add moderation/reporting workflow for public deployments.
- Add deeper mobile e2e coverage for touch gestures.

## 11. Repository usage (clone, configure, run)

```bash
git clone <your-repo-url>
cd leave-a-note
npm install
cp .env.example .env.local
# fill in real Cloudflare values
npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --remote --file=cloudflare/schema.sql
npm run dev
```

Open:
- Desktop: [http://localhost:3000](http://localhost:3000)
- Phone (same network): run with `--hostname 0.0.0.0`, then open `http://<LAN_IP>:3000`

If setup fails, check in this order:
1. `.env.local` has real values (not placeholders).
2. D1 schema has been applied.
3. R2 bucket exists and public base URL is correct.
4. Cloudflare token/key permissions match D1 + R2 operations.

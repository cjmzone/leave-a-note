-- Leave a Note MVP schema for Cloudflare D1 (SQLite)
-- Apply with Wrangler or the Cloudflare dashboard.

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  note_text TEXT NOT NULL CHECK (length(trim(note_text)) BETWEEN 1 AND 280),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS posts_created_at_desc_idx
  ON posts (created_at DESC);

CREATE TABLE IF NOT EXISTS post_rate_limits (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  last_post_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (ip_hash, last_post_date)
);

CREATE INDEX IF NOT EXISTS post_rate_limits_lookup_idx
  ON post_rate_limits (ip_hash, last_post_date);

-- R2 storage assumption for uploads:
--   Bucket name: post-images (or CLOUDFLARE_R2_BUCKET)
--   Bucket must be readable from CLOUDFLARE_R2_PUBLIC_BASE_URL.

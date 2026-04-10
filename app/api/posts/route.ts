import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { d1Execute, d1Query } from "@/lib/cloudflareD1";
import { MAX_IMAGE_BYTES, MAX_NOTE_LENGTH } from "@/lib/constants";
import { deleteCanvasImage, uploadCanvasImage } from "@/lib/imageUpload";
import { getClientIp, hashIp } from "@/lib/ip";
import { createR2BucketClient } from "@/lib/r2";

export const runtime = "nodejs";

type CreatePostBody = {
  imageDataUrl?: string;
  noteText?: string;
};

type PostRecord = {
  id: string;
  image_url: string;
  note_text: string;
  created_at: string;
};

type RateLimitRow = {
  id: string;
};

type ErrorInfo = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function getTodayDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function decodePngDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);

  if (!match) {
    return null;
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

async function rollbackRateLimit(ipHash: string, date: string): Promise<void> {
  await d1Execute(
    "DELETE FROM post_rate_limits WHERE ip_hash = ? AND last_post_date = ?",
    [ipHash, date]
  );
}

function extractErrorInfo(rawError: unknown): ErrorInfo {
  if (!rawError || typeof rawError !== "object") {
    return {};
  }

  const parsedError = rawError as Record<string, unknown>;
  const detailsFromError =
    typeof parsedError.details === "string" ? parsedError.details : undefined;

  return {
    code: typeof parsedError.code === "string" ? parsedError.code : undefined,
    message:
      typeof parsedError.message === "string" ? parsedError.message : undefined,
    details: detailsFromError,
    hint: typeof parsedError.hint === "string" ? parsedError.hint : undefined,
  };
}

function buildDevErrorMessage(baseMessage: string, rawError?: unknown): string {
  if (process.env.NODE_ENV === "production" || !rawError) {
    return baseMessage;
  }

  const { code, message, details, hint } = extractErrorInfo(rawError);
  const debugSegments = [code ? `code=${code}` : null, message, details, hint].filter(
    Boolean
  );

  if (debugSegments.length === 0) {
    return baseMessage;
  }

  return `${baseMessage} (${debugSegments.join(" | ")})`;
}

function buildSetupHint(rawError: unknown): string | null {
  const { code, message, details } = extractErrorInfo(rawError);
  const combinedDetails = `${message ?? ""} ${details ?? ""}`.toLowerCase();

  if (
    combinedDetails.includes("your_account_id") ||
    combinedDetails.includes("your_database_id") ||
    combinedDetails.includes("your-r2-public-base-url")
  ) {
    return "Replace placeholder values in .env.local with real Cloudflare IDs/keys.";
  }

  if (combinedDetails.includes("no such table")) {
    return "Run cloudflare/schema.sql so required D1 tables exist.";
  }

  if (
    combinedDetails.includes("nosuchbucket") ||
    combinedDetails.includes("bucket") && combinedDetails.includes("not found")
  ) {
    return "Verify CLOUDFLARE_R2_BUCKET and ensure the R2 bucket exists.";
  }

  if (
    code === "10000" ||
    combinedDetails.includes("unauthorized") ||
    combinedDetails.includes("authentication") ||
    combinedDetails.includes("signature")
  ) {
    return "Verify CLOUDFLARE_API_TOKEN and R2 access key credentials.";
  }

  return null;
}

function logApiError(context: string, rawError?: unknown): void {
  if (!rawError) {
    return;
  }

  const { code, message, details, hint } = extractErrorInfo(rawError);
  const setupHint = buildSetupHint(rawError);
  console.error(`[api/posts] ${context}`, {
    code,
    message,
    details,
    hint,
    setupHint,
  });
}

function maskIpHash(ipHash: string): string {
  return ipHash.slice(0, 12);
}

function logRateLimitDebug(
  message: string,
  details: Record<string, unknown>
): void {
  console.info(`[api/posts] ${message}`, details);
}

function isRateLimitConflictError(rawError: unknown): boolean {
  const { message, details } = extractErrorInfo(rawError);
  const normalized = `${message ?? ""} ${details ?? ""}`.toLowerCase();

  return (
    normalized.includes("unique") &&
    normalized.includes("post_rate_limits") &&
    normalized.includes("last_post_date")
  );
}

export async function GET() {
  try {
    const posts = await d1Query<PostRecord>(
      "SELECT id, image_url, note_text, created_at FROM posts ORDER BY created_at DESC"
    );

    return NextResponse.json({ posts });
  } catch (error) {
    const setupHint = buildSetupHint(error);
    logApiError("GET posts failed", error);

    return NextResponse.json(
      {
        error: buildDevErrorMessage(
          setupHint ? `Failed to load posts. ${setupHint}` : "Failed to load posts.",
          error
        ),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreatePostBody | null;

  const noteText = body?.noteText?.trim() ?? "";
  const imageDataUrl = body?.imageDataUrl ?? "";

  if (!noteText || noteText.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Note text must be 1-${MAX_NOTE_LENGTH} characters.` },
      { status: 400 }
    );
  }

  if (!imageDataUrl) {
    return NextResponse.json(
      { error: "A drawing image is required." },
      { status: 400 }
    );
  }

  const imageBuffer = decodePngDataUrl(imageDataUrl);

  if (!imageBuffer) {
    return NextResponse.json(
      { error: "Invalid canvas image. Expected PNG data URL." },
      { status: 400 }
    );
  }

  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Drawing image is too large." },
      { status: 400 }
    );
  }

  const ip = getClientIp(request);
  const ipHash = hashIp(ip);
  const todayDate = getTodayDateUtc();
  const isDevelopmentMode = process.env.NODE_ENV === "development";
  const maskedIpHash = maskIpHash(ipHash);

  if (!isDevelopmentMode) {
    logRateLimitDebug("rate limit check started", {
      nodeEnv: process.env.NODE_ENV ?? "undefined",
      ipHash: maskedIpHash,
      todayDateUtc: todayDate,
    });

    let existingRateLimitRows: RateLimitRow[];

    try {
      existingRateLimitRows = await d1Query<RateLimitRow>(
        "SELECT id FROM post_rate_limits WHERE ip_hash = ? AND last_post_date = ? LIMIT 1",
        [ipHash, todayDate]
      );
    } catch (rateLimitLookupError) {
      const setupHint = buildSetupHint(rateLimitLookupError);
      logApiError("Rate limit lookup failed", rateLimitLookupError);
      logRateLimitDebug("rate limit branch selected", {
        branch: "lookup_error",
        ipHash: maskedIpHash,
        todayDateUtc: todayDate,
      });
      return NextResponse.json(
        {
          error: buildDevErrorMessage(
            setupHint
              ? `Failed to verify rate limit. ${setupHint}`
              : "Failed to verify rate limit.",
            rateLimitLookupError
          ),
        },
        { status: 500 }
      );
    }

    logRateLimitDebug("rate limit lookup result", {
      ipHash: maskedIpHash,
      todayDateUtc: todayDate,
      existingRowCount: existingRateLimitRows.length,
    });

    if (existingRateLimitRows.length > 0) {
      logRateLimitDebug("rate limit branch selected", {
        branch: "lookup_hit",
        ipHash: maskedIpHash,
        todayDateUtc: todayDate,
      });
      return NextResponse.json(
        { error: "You can only create one post per day." },
        { status: 429 }
      );
    }

    // Reserve the daily slot before upload/insert. Unique constraint handles races.
    try {
      await d1Execute(
        "INSERT INTO post_rate_limits (id, ip_hash, last_post_date, created_at) VALUES (?, ?, ?, ?)",
        [randomUUID(), ipHash, todayDate, new Date().toISOString()]
      );
      logRateLimitDebug("rate limit reservation inserted", {
        ipHash: maskedIpHash,
        todayDateUtc: todayDate,
      });
    } catch (rateLimitError) {
      if (isRateLimitConflictError(rateLimitError)) {
        logRateLimitDebug("rate limit branch selected", {
          branch: "insert_conflict_hit",
          ipHash: maskedIpHash,
          todayDateUtc: todayDate,
        });
        return NextResponse.json(
          { error: "You can only create one post per day." },
          { status: 429 }
        );
      }

      const setupHint = buildSetupHint(rateLimitError);
      logApiError("Rate limit insert failed", rateLimitError);
      logRateLimitDebug("rate limit branch selected", {
        branch: "insert_error",
        ipHash: maskedIpHash,
        todayDateUtc: todayDate,
      });
      return NextResponse.json(
        {
          error: buildDevErrorMessage(
            setupHint
              ? `Failed to verify rate limit. ${setupHint}`
              : "Failed to verify rate limit.",
            rateLimitError
          ),
        },
        { status: 500 }
      );
    }
  } else {
    logRateLimitDebug("rate limit skipped", {
      branch: "development_bypass",
      nodeEnv: process.env.NODE_ENV ?? "undefined",
      ipHash: maskedIpHash,
      todayDateUtc: todayDate,
    });
  }

  const bucketClient = createR2BucketClient();

  let uploadedFilePath = "";
  let uploadedImageUrl = "";

  try {
    const uploadResult = await uploadCanvasImage({
      bucketClient,
      datePrefix: todayDate,
      imageBuffer,
    });
    uploadedFilePath = uploadResult.filePath;
    uploadedImageUrl = uploadResult.imageUrl;
  } catch (uploadError) {
    const setupHint = buildSetupHint(uploadError);
    logApiError("R2 upload failed", uploadError);
    await rollbackRateLimit(ipHash, todayDate);

    return NextResponse.json(
      {
        error: buildDevErrorMessage(
          setupHint
            ? `Failed to upload drawing image. ${setupHint}`
            : "Failed to upload drawing image.",
          uploadError
        ),
      },
      { status: 500 }
    );
  }

  const postId = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await d1Execute(
      "INSERT INTO posts (id, image_url, note_text, created_at) VALUES (?, ?, ?, ?)",
      [postId, uploadedImageUrl, noteText, createdAt]
    );
  } catch (insertPostError) {
    const setupHint = buildSetupHint(insertPostError);
    logApiError("Post insert failed", insertPostError);

    // Best-effort cleanup to avoid consuming a daily slot on server failure.
    await rollbackRateLimit(ipHash, todayDate);
    await deleteCanvasImage(bucketClient, uploadedFilePath);

    return NextResponse.json(
      {
        error: buildDevErrorMessage(
          setupHint ? `Failed to save post. ${setupHint}` : "Failed to save post.",
          insertPostError
        ),
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      post: {
        id: postId,
        image_url: uploadedImageUrl,
        note_text: noteText,
        created_at: createdAt,
      },
    },
    { status: 201 }
  );
}

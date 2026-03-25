import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGE_BYTES, MAX_NOTE_LENGTH } from "@/lib/constants";
import { env } from "@/lib/env";
import { deleteCanvasImage, uploadCanvasImage } from "@/lib/imageUpload";
import { getClientIp, hashIp } from "@/lib/ip";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CreatePostBody = {
  imageDataUrl?: string;
  noteText?: string;
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
  await supabaseAdmin
    .from("post_rate_limits")
    .delete()
    .eq("ip_hash", ipHash)
    .eq("last_post_date", date);
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("posts")
    .select("id, image_url, note_text, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load posts." },
      { status: 500 }
    );
  }

  return NextResponse.json({ posts: data ?? [] });
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

  // Reserve the daily slot first. Unique constraint enforces one post/IP/day.
  const { error: rateLimitError } = await supabaseAdmin
    .from("post_rate_limits")
    .insert({
      ip_hash: ipHash,
      last_post_date: todayDate,
    });

  if (rateLimitError) {
    if (rateLimitError.code === "23505") {
      return NextResponse.json(
        { error: "You can only create one post per day." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to verify rate limit." },
      { status: 500 }
    );
  }

  const bucketClient = supabaseAdmin.storage.from(env.SUPABASE_POST_IMAGES_BUCKET);

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
  } catch {
    await rollbackRateLimit(ipHash, todayDate);

    return NextResponse.json(
      { error: "Failed to upload drawing image." },
      { status: 500 }
    );
  }

  const { data: post, error: insertPostError } = await supabaseAdmin
    .from("posts")
    .insert({
      image_url: uploadedImageUrl,
      note_text: noteText,
    })
    .select("id, image_url, note_text, created_at")
    .single();

  if (insertPostError) {
    // Best-effort cleanup to avoid consuming a daily slot on server failure.
    await rollbackRateLimit(ipHash, todayDate);
    await deleteCanvasImage(bucketClient, uploadedFilePath);

    return NextResponse.json(
      { error: "Failed to save post." },
      { status: 500 }
    );
  }

  return NextResponse.json({ post }, { status: 201 });
}

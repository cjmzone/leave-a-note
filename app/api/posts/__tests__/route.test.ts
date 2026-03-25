import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_NOTE_LENGTH } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  getClientIp: vi.fn(),
  hashIp: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    SUPABASE_POST_IMAGES_BUCKET: "post-images",
  },
}));

vi.mock("@/lib/ip", () => ({
  getClientIp: mocks.getClientIp,
  hashIp: mocks.hashIp,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

import { GET, POST } from "@/app/api/posts/route";
import * as postsRouteModule from "@/app/api/posts/route";

const VALID_IMAGE_DATA_URL = `data:image/png;base64,${Buffer.from("fake-image-bytes").toString("base64")}`;

type SupabaseScenario = {
  getPosts?: Array<{ id: string; image_url: string; note_text: string; created_at: string }>;
  rateLimitError?: { code?: string; message: string } | null;
  uploadError?: { message: string } | null;
  insertPostError?: { message: string } | null;
};

function configureSupabase(scenario: SupabaseScenario = {}) {
  const getPosts = scenario.getPosts ?? [];

  const createdPost = {
    id: "post-1",
    image_url: "",
    note_text: "Hello world",
    created_at: "2026-03-25T13:00:00.000Z",
  };

  const postRateInsert = vi
    .fn()
    .mockResolvedValue({ error: scenario.rateLimitError ?? null });
  const postRateDeleteEqDate = vi.fn().mockResolvedValue({ error: null });
  const postRateDeleteEqHash = vi
    .fn()
    .mockReturnValue({ eq: postRateDeleteEqDate });
  const postRateDelete = vi.fn().mockReturnValue({ eq: postRateDeleteEqHash });

  const postsOrder = vi.fn().mockResolvedValue({ data: getPosts, error: null });
  const postsSelect = vi.fn().mockReturnValue({ order: postsOrder });

  const postInsertSingle = vi.fn().mockResolvedValue({
    data:
      scenario.insertPostError === null || scenario.insertPostError === undefined
        ? createdPost
        : null,
    error: scenario.insertPostError ?? null,
  });
  const postInsertSelect = vi.fn().mockReturnValue({ single: postInsertSingle });
  const postInsert = vi.fn().mockReturnValue({ select: postInsertSelect });

  mocks.supabaseAdmin.from.mockImplementation((tableName: string) => {
    if (tableName === "post_rate_limits") {
      return {
        insert: postRateInsert,
        delete: postRateDelete,
      };
    }

    if (tableName === "posts") {
      return {
        select: postsSelect,
        insert: postInsert,
      };
    }

    throw new Error(`Unexpected table: ${tableName}`);
  });

  const upload = vi.fn().mockResolvedValue({ error: scenario.uploadError ?? null });
  const getPublicUrl = vi
    .fn()
    .mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }));
  const remove = vi.fn().mockResolvedValue({ error: null });

  mocks.supabaseAdmin.storage.from.mockReturnValue({
    upload,
    getPublicUrl,
    remove,
  });

  return {
    postRateInsert,
    postsOrder,
    postInsert,
    upload,
    getPublicUrl,
    remove,
  };
}

function createPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/posts route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockReturnValue("203.0.113.10");
    mocks.hashIp.mockReturnValue("hashed-ip-value");
  });

  it("GET returns posts and requests reverse-chronological ordering", async () => {
    const seededPosts = [
      {
        id: "newer",
        image_url: "https://cdn.example/newer.png",
        note_text: "new",
        created_at: "2026-03-25T13:05:00.000Z",
      },
      {
        id: "older",
        image_url: "https://cdn.example/older.png",
        note_text: "old",
        created_at: "2026-03-24T13:05:00.000Z",
      },
    ];

    const supabase = configureSupabase({ getPosts: seededPosts });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.posts).toEqual(seededPosts);
    expect(supabase.postsOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("POST creates a post, uploads an image, and records hashed IP rate limit", async () => {
    const supabase = configureSupabase();

    const response = await POST(
      createPostRequest({
        noteText: "  Hello from anonymous user  ",
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.getClientIp).toHaveBeenCalledTimes(1);
    expect(mocks.hashIp).toHaveBeenCalledWith("203.0.113.10");
    expect(supabase.postRateInsert).toHaveBeenCalledWith({
      ip_hash: "hashed-ip-value",
      last_post_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });

    const uploadedPath = supabase.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^\d{4}-\d{2}-\d{2}\/.+\.png$/);
    expect(supabase.upload).toHaveBeenCalledWith(
      uploadedPath,
      expect.any(Buffer),
      {
        contentType: "image/png",
        upsert: false,
      }
    );

    expect(supabase.postInsert).toHaveBeenCalledWith({
      image_url: `https://cdn.example/${uploadedPath}`,
      note_text: "Hello from anonymous user",
    });
    expect(payload.post).toBeTruthy();
  });

  it("POST blocks a second post on the same day when rate-limit row already exists", async () => {
    const supabase = configureSupabase({
      rateLimitError: { code: "23505", message: "duplicate key" },
    });

    const response = await POST(
      createPostRequest({
        noteText: "Second attempt",
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toMatch(/one post per day/i);
    expect(supabase.upload).not.toHaveBeenCalled();
    expect(supabase.postInsert).not.toHaveBeenCalled();
  });

  it("POST rejects validation failures for note length and invalid image data", async () => {
    configureSupabase();

    const tooLongNoteResponse = await POST(
      createPostRequest({
        noteText: "a".repeat(MAX_NOTE_LENGTH + 1),
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    expect(tooLongNoteResponse.status).toBe(400);

    const invalidImageResponse = await POST(
      createPostRequest({
        noteText: "Valid text",
        imageDataUrl: "not-a-png-data-url",
      })
    );

    expect(invalidImageResponse.status).toBe(400);
  });

  it("POST rolls back rate-limit reservation and uploaded image when DB insert fails", async () => {
    const supabase = configureSupabase({
      insertPostError: { message: "db failure" },
    });

    const response = await POST(
      createPostRequest({
        noteText: "Keep this failure-path covered",
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    expect(response.status).toBe(500);
    expect(supabase.remove).toHaveBeenCalledTimes(1);
  });

  it("MVP keeps posts permanent by exposing only GET/POST endpoints", () => {
    expect(postsRouteModule.GET).toBeTypeOf("function");
    expect(postsRouteModule.POST).toBeTypeOf("function");
    expect((postsRouteModule as { PUT?: unknown }).PUT).toBeUndefined();
    expect((postsRouteModule as { PATCH?: unknown }).PATCH).toBeUndefined();
    expect((postsRouteModule as { DELETE?: unknown }).DELETE).toBeUndefined();
  });
});

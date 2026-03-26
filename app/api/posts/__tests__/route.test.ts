import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_NOTE_LENGTH } from "@/lib/constants";

const mocks = vi.hoisted(() => ({
  getClientIp: vi.fn(),
  hashIp: vi.fn(),
  d1Query: vi.fn(),
  d1Execute: vi.fn(),
  createR2BucketClient: vi.fn(),
}));

vi.mock("@/lib/ip", () => ({
  getClientIp: mocks.getClientIp,
  hashIp: mocks.hashIp,
}));

vi.mock("@/lib/cloudflareD1", () => ({
  d1Query: mocks.d1Query,
  d1Execute: mocks.d1Execute,
}));

vi.mock("@/lib/r2", () => ({
  createR2BucketClient: mocks.createR2BucketClient,
}));

import { GET, POST } from "@/app/api/posts/route";
import * as postsRouteModule from "@/app/api/posts/route";

const VALID_IMAGE_DATA_URL = `data:image/png;base64,${Buffer.from("fake-image-bytes").toString("base64")}`;

type TestScenario = {
  getPosts?: Array<{ id: string; image_url: string; note_text: string; created_at: string }>;
  getPostsError?: { code?: string; message: string; details?: string } | null;
  rateLimitError?: { code?: string; message: string; details?: string } | null;
  uploadError?: { message: string } | null;
  insertPostError?: { code?: string; message: string; details?: string } | null;
};

function configureScenario(scenario: TestScenario = {}) {
  mocks.d1Query.mockReset();
  mocks.d1Execute.mockReset();
  mocks.createR2BucketClient.mockReset();

  if (scenario.getPostsError) {
    mocks.d1Query.mockRejectedValue(scenario.getPostsError);
  } else {
    mocks.d1Query.mockResolvedValue(scenario.getPosts ?? []);
  }

  mocks.d1Execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith("INSERT INTO post_rate_limits") && scenario.rateLimitError) {
      throw scenario.rateLimitError;
    }

    if (sql.startsWith("INSERT INTO posts") && scenario.insertPostError) {
      throw scenario.insertPostError;
    }
  });

  const upload = vi.fn().mockResolvedValue({ error: scenario.uploadError ?? null });
  const getPublicUrl = vi
    .fn()
    .mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }));
  const remove = vi.fn().mockResolvedValue({ error: null });

  mocks.createR2BucketClient.mockReturnValue({
    upload,
    getPublicUrl,
    remove,
  });

  return {
    upload,
    getPublicUrl,
    remove,
    d1Execute: mocks.d1Execute,
    d1Query: mocks.d1Query,
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
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockReturnValue("203.0.113.10");
    mocks.hashIp.mockReturnValue("hashed-ip-value");
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
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

    const context = configureScenario({ getPosts: seededPosts });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.posts).toEqual(seededPosts);
    expect(context.d1Query).toHaveBeenCalledWith(
      "SELECT id, image_url, note_text, created_at FROM posts ORDER BY created_at DESC"
    );
  });

  it("GET returns a setup hint in development when placeholders are still in use", async () => {
    configureScenario({
      getPostsError: {
        message: "TypeError: fetch failed your_account_id",
      },
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toMatch(/replace placeholder values in \.env\.local/i);
  });

  it("POST creates a post, uploads an image, and records hashed IP rate limit", async () => {
    const context = configureScenario();

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

    const d1Calls = context.d1Execute.mock.calls.map((entry) => entry[0] as string);
    expect(d1Calls.some((sql) => sql.startsWith("INSERT INTO post_rate_limits"))).toBe(true);
    expect(d1Calls.some((sql) => sql.startsWith("INSERT INTO posts"))).toBe(true);

    const uploadedPath = context.upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^\d{4}-\d{2}-\d{2}\/.+\.png$/);
    expect(context.upload).toHaveBeenCalledWith(
      uploadedPath,
      expect.any(Buffer),
      {
        contentType: "image/png",
        upsert: false,
      }
    );

    expect(payload.post).toMatchObject({
      image_url: `https://cdn.example/${uploadedPath}`,
      note_text: "Hello from anonymous user",
    });
  });

  it("POST blocks a second post on the same day when the daily rate-limit row already exists", async () => {
    const context = configureScenario({
      rateLimitError: {
        message:
          "UNIQUE constraint failed: post_rate_limits.ip_hash, post_rate_limits.last_post_date",
      },
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
    expect(context.upload).not.toHaveBeenCalled();
  });

  it("POST bypasses the daily rate-limit check in development mode", async () => {
    process.env.NODE_ENV = "development";

    const context = configureScenario({
      rateLimitError: {
        message:
          "UNIQUE constraint failed: post_rate_limits.ip_hash, post_rate_limits.last_post_date",
      },
    });

    const response = await POST(
      createPostRequest({
        noteText: "Development bypass",
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    expect(response.status).toBe(201);

    const d1Calls = context.d1Execute.mock.calls.map((entry) => entry[0] as string);
    expect(d1Calls.some((sql) => sql.startsWith("INSERT INTO post_rate_limits"))).toBe(
      false
    );
    expect(context.upload).toHaveBeenCalledTimes(1);
  });

  it("POST rejects validation failures for note length and invalid image data", async () => {
    configureScenario();

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
    const context = configureScenario({
      insertPostError: { message: "db failure" },
    });

    const response = await POST(
      createPostRequest({
        noteText: "Keep this failure-path covered",
        imageDataUrl: VALID_IMAGE_DATA_URL,
      })
    );

    expect(response.status).toBe(500);
    expect(context.remove).toHaveBeenCalledTimes(1);

    const d1Calls = context.d1Execute.mock.calls.map((entry) => entry[0] as string);
    expect(
      d1Calls.some((sql) => sql.startsWith("DELETE FROM post_rate_limits"))
    ).toBe(true);
  });

  it("MVP keeps posts permanent by exposing only GET/POST endpoints", () => {
    expect(postsRouteModule.GET).toBeTypeOf("function");
    expect(postsRouteModule.POST).toBeTypeOf("function");
    expect((postsRouteModule as { PUT?: unknown }).PUT).toBeUndefined();
    expect((postsRouteModule as { PATCH?: unknown }).PATCH).toBeUndefined();
    expect((postsRouteModule as { DELETE?: unknown }).DELETE).toBeUndefined();
  });
});

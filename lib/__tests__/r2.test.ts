import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("R2 client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "token-abc",
      CLOUDFLARE_D1_DATABASE_ID: "db-789",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "r2-access",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "r2-secret",
      CLOUDFLARE_R2_BUCKET: "post-images",
      CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://pub.example.r2.dev",
      IP_HASH_SALT: "test-salt",
    };

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("uploads/removes objects and builds public URLs", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    const { createR2BucketClient } = await import("@/lib/r2");
    const bucketClient = createR2BucketClient();

    const uploadResult = await bucketClient.upload(
      "2026-03-25/file.png",
      Buffer.from("image-bytes"),
      {
        contentType: "image/png",
        upsert: false,
      }
    );

    expect(uploadResult.error).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acct-123.r2.cloudflarestorage.com/post-images/2026-03-25/file.png",
      expect.objectContaining({
        method: "PUT",
      })
    );

    expect(bucketClient.getPublicUrl("2026-03-25/file.png").data.publicUrl).toBe(
      "https://pub.example.r2.dev/2026-03-25/file.png"
    );

    const deleteResult = await bucketClient.remove(["2026-03-25/file.png"]);
    expect(deleteResult.error).toBeNull();
  });

  it("returns an error payload when R2 upload/delete fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "NoSuchBucket",
    } as Response);

    const { createR2BucketClient } = await import("@/lib/r2");
    const bucketClient = createR2BucketClient();

    const uploadResult = await bucketClient.upload(
      "2026-03-25/file.png",
      Buffer.from("image-bytes"),
      {
        contentType: "image/png",
        upsert: false,
      }
    );

    expect(uploadResult.error?.message).toMatch(/r2 put failed/i);

    const deleteResult = await bucketClient.remove(["2026-03-25/file.png"]);
    expect(deleteResult.error?.message).toMatch(/r2 delete failed/i);
  });
});

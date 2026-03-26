import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cloudflare D1 client", () => {
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
      CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://pub.example.r2.dev",
      IP_HASH_SALT: "test-salt",
    };

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("runs a D1 query and returns rows", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: [
          {
            success: true,
            results: [{ id: "post-1" }],
          },
        ],
      }),
    } as Response);

    const { d1Query } = await import("@/lib/cloudflareD1");

    const rows = await d1Query<{ id: string }>("SELECT id FROM posts", []);

    expect(rows).toEqual([{ id: "post-1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/acct-123/d1/database/db-789/query",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("throws a useful error when Cloudflare returns an HTTP failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: "Authentication error" }],
      }),
    } as Response);

    const { d1Execute } = await import("@/lib/cloudflareD1");

    await expect(d1Execute("SELECT 1")).rejects.toThrow(
      "Cloudflare D1 request failed"
    );
  });
});

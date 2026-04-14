import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("env configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_D1_DATABASE_ID;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET;
    delete process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
    delete process.env.IP_HASH_SALT;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  function setRequiredCloudflareEnv() {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
    process.env.CLOUDFLARE_API_TOKEN = "api-token";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "d1-id";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "r2-access-key";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "r2-secret";
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = "https://pub-example.r2.dev";
  }

  it("loads required Cloudflare config and applies the default R2 bucket", async () => {
    process.env.NODE_ENV = "development";
    setRequiredCloudflareEnv();
    process.env.IP_HASH_SALT = "test-salt";

    const { env } = await import("@/lib/env");

    expect(env.CLOUDFLARE_ACCOUNT_ID).toBe("account-id");
    expect(env.CLOUDFLARE_D1_DATABASE_ID).toBe("d1-id");
    expect(env.CLOUDFLARE_R2_BUCKET).toBe("post-images");
  });

  it("uses a development fallback salt when IP_HASH_SALT is missing", async () => {
    process.env.NODE_ENV = "development";
    setRequiredCloudflareEnv();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { env } = await import("@/lib/env");

    expect(env.IP_HASH_SALT).toBe("dev-ip-hash-salt-change-me");
    expect(warnSpy).toHaveBeenCalledWith(
      "[leave-a-note] Missing IP_HASH_SALT. Using an insecure development fallback salt."
    );
  });

  it("throws when a required Cloudflare variable is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "d1-id";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "r2-access-key";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "r2-secret";
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL = "https://pub-example.r2.dev";
    process.env.IP_HASH_SALT = "production-salt";

    await expect(import("@/lib/env")).rejects.toThrow(
      "Missing required environment variable: CLOUDFLARE_API_TOKEN"
    );
  });
});

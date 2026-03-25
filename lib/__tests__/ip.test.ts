import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    IP_HASH_SALT: "test-salt",
  },
}));

import { getClientIp, hashIp } from "@/lib/ip";

describe("IP utilities", () => {
  it("hashIp stores a deterministic salted SHA-256 value (not raw IP)", () => {
    const ip = "203.0.113.42";

    const expectedHash = createHash("sha256")
      .update(`${ip}:test-salt`)
      .digest("hex");

    const hashed = hashIp(ip);

    expect(hashed).toBe(expectedHash);
    expect(hashed).not.toContain(ip);
  });

  it("getClientIp uses the first x-forwarded-for IP and falls back safely", () => {
    const forwardedRequest = new NextRequest("http://localhost/api/posts", {
      headers: {
        "x-forwarded-for": "198.51.100.3, 10.0.0.1",
      },
    });

    expect(getClientIp(forwardedRequest)).toBe("198.51.100.3");

    const fallbackRequest = new NextRequest("http://localhost/api/posts");

    expect(getClientIp(fallbackRequest)).toBe("0.0.0.0");
  });
});

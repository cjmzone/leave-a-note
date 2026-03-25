import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfIp = request.headers.get("cf-connecting-ip");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return realIp || cfIp || "0.0.0.0";
}

export function hashIp(ipAddress: string): string {
  return createHash("sha256")
    .update(`${ipAddress}:${env.IP_HASH_SALT}`)
    .digest("hex");
}

import { DEFAULT_R2_BUCKET } from "@/lib/constants";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readIpHashSalt(): string {
  const configuredSalt = process.env.IP_HASH_SALT;

  if (configuredSalt) {
    return configuredSalt;
  }

  if (process.env.NODE_ENV !== "production") {
    // Keep local development unblocked while still encouraging a real secret.
    console.warn(
      "[leave-a-note] Missing IP_HASH_SALT. Using an insecure development fallback salt."
    );
    return "dev-ip-hash-salt-change-me";
  }

  throw new Error("Missing required environment variable: IP_HASH_SALT");
}

export const env = {
  CLOUDFLARE_ACCOUNT_ID: readEnv("CLOUDFLARE_ACCOUNT_ID"),
  CLOUDFLARE_API_TOKEN: readEnv("CLOUDFLARE_API_TOKEN"),
  CLOUDFLARE_D1_DATABASE_ID: readEnv("CLOUDFLARE_D1_DATABASE_ID"),
  CLOUDFLARE_R2_ACCESS_KEY_ID: readEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: readEnv(
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  ),
  CLOUDFLARE_R2_BUCKET: process.env.CLOUDFLARE_R2_BUCKET || DEFAULT_R2_BUCKET,
  CLOUDFLARE_R2_PUBLIC_BASE_URL: readEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL"),
  IP_HASH_SALT: readIpHashSalt(),
};

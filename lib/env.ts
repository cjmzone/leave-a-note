import { DEFAULT_SUPABASE_BUCKET } from "@/lib/constants";

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_POST_IMAGES_BUCKET:
    process.env.SUPABASE_POST_IMAGES_BUCKET || DEFAULT_SUPABASE_BUCKET,
  IP_HASH_SALT: readEnv("IP_HASH_SALT"),
};

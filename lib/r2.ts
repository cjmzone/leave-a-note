import { createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";

export type R2BucketClient = {
  upload: (
    key: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean }
  ) => Promise<{ error: { message: string } | null }>;
  getPublicUrl: (key: string) => { data: { publicUrl: string } };
  remove: (keys: string[]) => Promise<{ error?: { message: string } | null }>;
};

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function toAmzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = `${iso.slice(0, 8)}T${iso.slice(9, 15)}Z`;
  const dateStamp = iso.slice(0, 8);

  return { amzDate, dateStamp };
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizePublicBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

type SignedRequestParams = {
  method: "PUT" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
};

async function sendSignedR2Request({
  method,
  key,
  body,
  contentType,
}: SignedRequestParams): Promise<void> {
  const host = `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const encodedKey = encodeObjectKey(key);
  const path = `/${env.CLOUDFLARE_R2_BUCKET}/${encodedKey}`;
  const url = `https://${host}${path}`;

  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const payloadHash = sha256Hex(body ?? "");

  const headerEntries: Array<[string, string]> = [
    ["host", host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];

  if (contentType) {
    headerEntries.push(["content-type", contentType]);
  }

  headerEntries.sort(([a], [b]) => (a > b ? 1 : -1));

  const canonicalHeaders = headerEntries
    .map(([headerName, headerValue]) => `${headerName}:${headerValue}\n`)
    .join("");
  const signedHeaders = headerEntries.map(([headerName]) => headerName).join(";");

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKeyDate = hmacSha256(
    `AWS4${env.CLOUDFLARE_R2_SECRET_ACCESS_KEY}`,
    dateStamp
  );
  const signingKeyRegion = hmacSha256(signingKeyDate, "auto");
  const signingKeyService = hmacSha256(signingKeyRegion, "s3");
  const signingKey = hmacSha256(signingKeyService, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${env.CLOUDFLARE_R2_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers();
  headers.set("Host", host);
  headers.set("x-amz-date", amzDate);
  headers.set("x-amz-content-sha256", payloadHash);
  headers.set("Authorization", authorizationHeader);

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`R2 ${method} failed: HTTP ${response.status} ${errorBody}`);
  }
}

export function createR2BucketClient(): R2BucketClient {
  const publicBaseUrl = normalizePublicBaseUrl(env.CLOUDFLARE_R2_PUBLIC_BASE_URL);

  return {
    async upload(key, body, options) {
      try {
        await sendSignedR2Request({
          method: "PUT",
          key,
          body,
          contentType: options.contentType,
        });

        return { error: null };
      } catch (error) {
        return {
          error: {
            message:
              error instanceof Error ? error.message : "Failed to upload to R2.",
          },
        };
      }
    },

    getPublicUrl(key) {
      return {
        data: {
          publicUrl: `${publicBaseUrl}/${key}`,
        },
      };
    },

    async remove(keys) {
      try {
        await Promise.all(
          keys.map((key) =>
            sendSignedR2Request({
              method: "DELETE",
              key,
            })
          )
        );

        return { error: null };
      } catch (error) {
        return {
          error: {
            message:
              error instanceof Error ? error.message : "Failed to delete from R2.",
          },
        };
      }
    },
  };
}

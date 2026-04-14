import { env } from "@/lib/env";

type D1ResponseError = {
  code?: number;
  message?: string;
};

type D1StatementResult<T> = {
  success: boolean;
  results?: T[];
  error?: string;
};

type D1ApiResponse<T> = {
  success: boolean;
  errors?: D1ResponseError[];
  result?: D1StatementResult<T>[];
};

export type D1QueryParam = string | number | null;

export class CloudflareD1Error extends Error {
  code?: string;
  details?: string;

  constructor(message: string, options?: { code?: string; details?: string }) {
    super(message);
    this.name = "CloudflareD1Error";
    this.code = options?.code;
    this.details = options?.details;
  }
}

const d1Endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`;

async function requestD1<T>(sql: string, params: D1QueryParam[]): Promise<T[]> {
  const response = await fetch(d1Endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | D1ApiResponse<T>
    | null;

  if (!response.ok) {
    const firstError = payload?.errors?.[0];
    throw new CloudflareD1Error("Cloudflare D1 request failed", {
      code: firstError?.code ? String(firstError.code) : undefined,
      details: firstError?.message ?? `HTTP ${response.status}`,
    });
  }

  if (!payload?.success) {
    const firstError = payload?.errors?.[0];
    throw new CloudflareD1Error("Cloudflare D1 query failed", {
      code: firstError?.code ? String(firstError.code) : undefined,
      details: firstError?.message,
    });
  }

  const statementResult = payload.result?.[0];

  if (!statementResult?.success) {
    throw new CloudflareD1Error("Cloudflare D1 statement failed", {
      details: statementResult?.error,
    });
  }

  return statementResult.results ?? [];
}

export async function d1Query<T>(
  sql: string,
  params: D1QueryParam[] = []
): Promise<T[]> {
  return requestD1<T>(sql, params);
}

export async function d1Execute(
  sql: string,
  params: D1QueryParam[] = []
): Promise<void> {
  await requestD1(sql, params);
}

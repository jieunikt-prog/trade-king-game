type RedisResult<T> = { result?: T; error?: string };

export type RedisStorageErrorCode =
  | "REDIS_NOT_CONFIGURED"
  | "REDIS_AUTH_FAILED"
  | "REDIS_REQUEST_FAILED"
  | "REDIS_INVALID_RESPONSE";

export class RedisStorageError extends Error {
  code: RedisStorageErrorCode;
  status?: number;

  constructor(code: RedisStorageErrorCode, message: string, status?: number) {
    super(message);
    this.name = "RedisStorageError";
    this.code = code;
    this.status = status;
  }
}

type RedisCredentials = {
  url: string;
  token: string;
  source: string;
};

function clean(value: string | undefined): string {
  return (value || "").trim();
}

function pair(url: string | undefined, token: string | undefined, source: string): RedisCredentials | null {
  const cleanUrl = clean(url);
  const cleanToken = clean(token);
  if (!cleanUrl || !cleanToken) return null;
  return {
    url: cleanUrl.replace(/\/$/, ""),
    token: cleanToken,
    source,
  };
}

function findMarketplaceCredentials(): RedisCredentials | null {
  const urlSuffix = "_KV_REST_API_URL";
  const tokenSuffix = "_KV_REST_API_TOKEN";

  for (const [key, rawUrl] of Object.entries(process.env)) {
    if (!key.endsWith(urlSuffix)) continue;
    const prefix = key.slice(0, -urlSuffix.length);
    const found = pair(rawUrl, process.env[`${prefix}${tokenSuffix}`], `${prefix}KV_REST_API_*`);
    if (found) return found;
  }
  return null;
}

function credentials(): RedisCredentials {
  // Vercel Marketplace currently exposes these names for the connected Upstash store.
  const vercelKv = pair(
    process.env.KV_REST_API_URL,
    process.env.KV_REST_API_TOKEN,
    "KV_REST_API_*"
  );
  if (vercelKv) return vercelKv;

  // Standard Upstash names are also supported.
  const upstash = pair(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_REDIS_REST_TOKEN,
    "UPSTASH_REDIS_REST_*"
  );
  if (upstash) return upstash;

  // Some Marketplace connections add a project/store prefix.
  const marketplace = findMarketplaceCredentials();
  if (marketplace) return marketplace;

  throw new RedisStorageError(
    "REDIS_NOT_CONFIGURED",
    "Redis environment variables are missing. Expected KV_REST_API_URL + KV_REST_API_TOKEN, UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or a matching *_KV_REST_API_URL + *_KV_REST_API_TOKEN pair."
  );
}

export function redisConfigurationStatus() {
  try {
    const c = credentials();
    return { configured: true as const, source: c.source };
  } catch (error) {
    return {
      configured: false as const,
      source: null,
      code: error instanceof RedisStorageError ? error.code : "REDIS_NOT_CONFIGURED",
    };
  }
}

export async function redisCommand<T = unknown>(
  command: Array<string | number>
): Promise<T> {
  const { url, token } = credentials();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
  } catch (error) {
    throw new RedisStorageError(
      "REDIS_REQUEST_FAILED",
      `Redis network request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let data: RedisResult<T>;
  try {
    data = (await response.json()) as RedisResult<T>;
  } catch {
    throw new RedisStorageError(
      "REDIS_INVALID_RESPONSE",
      `Redis returned a non-JSON response (HTTP ${response.status}).`,
      response.status
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new RedisStorageError(
      "REDIS_AUTH_FAILED",
      `Redis authentication failed (HTTP ${response.status}).`,
      response.status
    );
  }

  if (!response.ok || data.error) {
    throw new RedisStorageError(
      "REDIS_REQUEST_FAILED",
      data.error || `Redis request failed (HTTP ${response.status}).`,
      response.status
    );
  }

  return data.result as T;
}

export function publicStorageError(error: unknown): { error: string; storageCode?: RedisStorageErrorCode } {
  if (!(error instanceof RedisStorageError)) {
    return { error: "서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }

  if (error.code === "REDIS_NOT_CONFIGURED") {
    return {
      error: "저장소 환경변수가 연결되지 않았습니다. Vercel Storage 연결을 확인해주세요.",
      storageCode: error.code,
    };
  }
  if (error.code === "REDIS_AUTH_FAILED") {
    return {
      error: "저장소 인증에 실패했습니다. Vercel의 KV_REST_API_URL/TOKEN 연결을 다시 확인해주세요.",
      storageCode: error.code,
    };
  }
  return {
    error: "저장소와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.",
    storageCode: error.code,
  };
}

export async function getJson<T>(key: string): Promise<T | null> {
  const value = await redisCommand<string | null>(["GET", key]);
  return value ? (JSON.parse(value) as T) : null;
}

export async function setJsonIfMissing(
  key: string,
  value: unknown
): Promise<boolean> {
  const result = await redisCommand<string | null>([
    "SET",
    key,
    JSON.stringify(value),
    "NX",
  ]);
  return result === "OK";
}

const CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return -1
end
local ok, decoded = pcall(cjson.decode, current)
if not ok then
  return -2
end
if tonumber(decoded.version) ~= tonumber(ARGV[1]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2])
return 1
`;

export async function compareAndSetJson(
  key: string,
  expectedVersion: number,
  value: unknown
): Promise<"ok" | "conflict" | "missing"> {
  const result = await redisCommand<number>([
    "EVAL",
    CAS_SCRIPT,
    1,
    key,
    expectedVersion,
    JSON.stringify(value),
  ]);
  if (result === 1) return "ok";
  if (result === 0) return "conflict";
  if (result === -1) return "missing";
  throw new Error("Stored game data is invalid.");
}

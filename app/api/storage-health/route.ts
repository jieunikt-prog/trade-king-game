import { publicStorageError, redisCommand, redisConfigurationStatus } from "@/lib/upstash-rest";

export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = redisConfigurationStatus();
  if (!configuration.configured) {
    return Response.json(
      { ok: false, configured: false, storageCode: configuration.code },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const pong = await redisCommand<string>(["PING"]);
    return Response.json(
      { ok: pong === "PONG", configured: true, source: configuration.source },
      { status: pong === "PONG" ? 200 : 500, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/storage-health failed", error);
    return Response.json(
      { ok: false, configured: true, source: configuration.source, ...publicStorageError(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

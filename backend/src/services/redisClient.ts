import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });
    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });
    redis.on("connect", () => {
      console.log("[Redis] Connected");
    });
    redis.connect().catch(() => {});
  }
  return redis;
}

const GEN_KEY_PREFIX = "generation:status:";
const GEN_TTL = 3600; // 1 hour

export interface GenerationStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface GenerationStatus {
  classId: number;
  type: "class" | "notes";
  status: "running" | "done" | "error";
  steps: GenerationStep[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export async function getGenerationStatus(
  classId: number,
  type: string = "class",
): Promise<GenerationStatus | null> {
  try {
    const data = await getRedis().get(`${GEN_KEY_PREFIX}${type}:${classId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setGenerationStatus(
  status: GenerationStatus,
): Promise<void> {
  try {
    await getRedis().set(
      `${GEN_KEY_PREFIX}${status.type}:${status.classId}`,
      JSON.stringify(status),
      "EX",
      GEN_TTL,
    );
  } catch (err) {
    console.error("[Redis] Error setting generation status:", err);
  }
}

export async function deleteGenerationStatus(
  classId: number,
  type: string = "class",
): Promise<void> {
  try {
    await getRedis().del(`${GEN_KEY_PREFIX}${type}:${classId}`);
  } catch {}
}

export async function getAllGenerationStatuses(): Promise<GenerationStatus[]> {
  try {
    const keys = await getRedis().keys(`${GEN_KEY_PREFIX}*`);
    if (keys.length === 0) return [];
    const values = await getRedis().mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map((v) => JSON.parse(v))
      .sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

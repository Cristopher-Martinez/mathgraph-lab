import { createHash } from "crypto";
import { getRedis } from "./redisClient";

const CACHE_PREFIX = "cache:";

/** Generate a deterministic cache key from prefix + input */
export function cacheKey(prefix: string, input: string): string {
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${CACHE_PREFIX}${prefix}:${hash}`;
}

/** Get cached value, returns null on miss */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    if (!raw) return null;
    console.log(`[Cache] HIT ${key.slice(0, 50)}`);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Set cached value with TTL in seconds */
export async function setCached(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Cache write failure is non-critical
  }
}

// TTL constants (seconds)
export const TTL = {
  EMBEDDING: 7 * 24 * 3600, // 7 days
  TRANSCRIPT: 24 * 3600, // 24h
  IMAGE: 24 * 3600, // 24h
  CURRICULUM: 3600, // 1h
};

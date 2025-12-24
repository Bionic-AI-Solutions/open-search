import crypto from "crypto";
import { getCached, setCache } from "../clients/redis.js";

export function generateCacheKey(prefix: string, data: any): string {
  const hash = crypto
    .createHash("md5")
    .update(JSON.stringify(data))
    .digest("hex");
  return `${prefix}:${hash}`;
}

export async function withCache<T>(
  cacheKey: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache
  const cached = await getCached<T>(cacheKey);
  if (cached !== null) {
    console.log(`Cache hit: ${cacheKey}`);
    return cached;
  }

  // Execute fetch function
  console.log(`Cache miss: ${cacheKey}`);
  const result = await fetchFn();

  // Store in cache
  await setCache(cacheKey, result, ttl);

  return result;
}

import { createClient, RedisClientType } from "redis";
import { config } from "../config.js";

let redisClient: RedisClientType | null = null;
let isConnected = false;

export async function initializeRedis(): Promise<void> {
  if (!config.redis.enabled) {
    console.log("Redis caching is disabled");
    return;
  }

  try {
    redisClient = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error("Redis: Max reconnection attempts reached");
            return new Error("Max reconnection attempts reached");
          }
          return retries * 1000;
        },
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
      isConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("Redis connecting...");
    });

    redisClient.on("ready", () => {
      console.log("Redis connected and ready");
      isConnected = true;
    });

    await redisClient.connect();
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    redisClient = null;
    isConnected = false;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!isConnected || !redisClient) {
    return null;
  }

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    console.error("Cache get error:", error);
  }

  return null;
}

export async function setCache(
  key: string,
  value: any,
  ttl: number
): Promise<void> {
  if (!isConnected || !redisClient) {
    return;
  }

  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!isConnected || !redisClient) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    console.error("Cache delete error:", error);
  }
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export function isRedisConnected(): boolean {
  return isConnected;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    isConnected = false;
  }
}

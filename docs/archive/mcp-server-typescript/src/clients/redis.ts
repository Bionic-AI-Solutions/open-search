import { createClient, createCluster, RedisClientType, RedisClusterType } from "redis";
import { config } from "../config.js";

let redisClient: RedisClientType | RedisClusterType | null = null;
let isConnected = false;

export async function initializeRedis(): Promise<void> {
  if (!config.redis.enabled) {
    console.error("[Redis] Caching is disabled");
    return;
  }

  try {
    console.error(`[Redis] Attempting to connect to: ${config.redis.url.replace(/:[^:@]+@/, ':****@')}`);
    
    // Check if this is a Redis Cluster
    const isCluster = config.redis.url.includes('redis-cluster') || 
                     process.env.REDIS_CLUSTER_MODE === 'true';
    
    if (isCluster) {
      // For Redis Cluster, use createCluster with root nodes
      // Extract host and port from URL
      const urlMatch = config.redis.url.match(/redis:\/\/(?:([^:@]+)(?::([^@]+))?@)?([^:]+):(\d+)/);
      if (urlMatch) {
        const password = urlMatch[2] || process.env.REDIS_PASSWORD || "";
        const host = urlMatch[3];
        const port = parseInt(urlMatch[4]);
        
        console.error(`[Redis] Connecting to Redis Cluster at ${host}:${port}`);
        
        // Create cluster client with the service as root node
        // The cluster client will discover other nodes automatically
        redisClient = createCluster({
          rootNodes: [{
            url: config.redis.url,
          }],
          defaults: {
            socket: {
              connectTimeout: 5000,
              reconnectStrategy: (retries) => {
                if (retries > 3) {
                  console.error("[Redis] Max reconnection attempts reached, disabling Redis cache");
                  isConnected = false;
                  redisClient = null;
                  return new Error("Max reconnection attempts reached");
                }
                const delay = Math.min(retries * 1000, 5000);
                console.error(`[Redis] Reconnection attempt ${retries} in ${delay}ms...`);
                return delay;
              },
            },
          },
          maxCommandRedirections: 16,
        });
      } else {
        throw new Error("Invalid Redis URL format for cluster");
      }
    } else {
      // Standard Redis connection
      redisClient = createClient({
        url: config.redis.url,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.error("[Redis] Max reconnection attempts reached, disabling Redis cache");
              isConnected = false;
              redisClient = null;
              return new Error("Max reconnection attempts reached");
            }
            const delay = Math.min(retries * 1000, 5000);
            console.error(`[Redis] Reconnection attempt ${retries} in ${delay}ms...`);
            return delay;
          },
        },
      });
    }

    // Set up event handlers (works for both client and cluster)
    redisClient.on("error", (err) => {
      // Only log errors if we're not already disconnected
      if (isConnected || redisClient) {
        console.error("[Redis] Client Error:", err.message || err);
      }
      isConnected = false;
    });

    if (!isCluster) {
      // Standard client events
      redisClient.on("connect", () => {
        console.error("[Redis] Connecting...");
      });

      redisClient.on("ready", () => {
        console.error("[Redis] Connected and ready");
        isConnected = true;
      });

      redisClient.on("end", () => {
        console.error("[Redis] Connection ended");
        isConnected = false;
      });
    } else {
      // Cluster client - ready event is fired after connection
      console.error("[Redis] Connecting to cluster...");
    }

    // Set a timeout for the connection attempt
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Connection timeout")), 10000)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    
    // For cluster, test with a ping to verify connection
    if (isCluster) {
      try {
        // Cluster client supports same commands as regular client
        const pong = await (redisClient as any).ping();
        console.error(`[Redis] Cluster connected and ready (PING: ${pong})`);
        isConnected = true;
      } catch (error) {
        // If ping fails, connection might still be valid - cluster handles routing
        console.error(`[Redis] Cluster connected (ping test skipped: ${error instanceof Error ? error.message : String(error)})`);
        isConnected = true; // Assume connected if connect() succeeded
      }
    } else {
      console.error("[Redis] Successfully connected");
      isConnected = true;
    }
  } catch (error) {
    console.error(`[Redis] Failed to initialize (continuing without cache): ${error instanceof Error ? error.message : String(error)}`);
    // Don't throw - allow server to continue without Redis
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (e) {
        // Ignore quit errors
      }
    }
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

export function getRedisClient(): RedisClientType | RedisClusterType | null {
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

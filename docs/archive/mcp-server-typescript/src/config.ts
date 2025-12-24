import dotenv from "dotenv";

dotenv.config();

export const config = {
  searxng: {
    url: process.env.SEARXNG_URL || "http://localhost:8080",
    timeout: parseInt(process.env.SEARXNG_TIMEOUT || "30000"),
  },
  crawl4ai: {
    url: process.env.CRAWL4AI_URL || "http://localhost:8000",
    timeout: parseInt(process.env.CRAWL4AI_TIMEOUT || "60000"),
  },
  redis: {
    url: process.env.REDIS_URL || (() => {
      // Construct URL from individual components if REDIS_URL not set
      const host = process.env.REDIS_HOST || "localhost";
      const port = process.env.REDIS_PORT || "6379";
      const password = process.env.REDIS_PASSWORD || "";
      return password ? `redis://:${password}@${host}:${port}` : `redis://${host}:${port}`;
    })(),
    ttl: {
      search: parseInt(process.env.CACHE_TTL_SEARCH || "3600"), // 1 hour
      crawl: parseInt(process.env.CACHE_TTL_CRAWL || "86400"),  // 24 hours
    },
    enabled: process.env.REDIS_ENABLED !== "false",
  },
  server: {
    port: parseInt(process.env.PORT || "3000"),
    env: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
    transport: process.env.MCP_TRANSPORT || "auto", // "stdio", "http", or "auto"
  },
};

export default config;

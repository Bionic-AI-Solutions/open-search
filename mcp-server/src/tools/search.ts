import { searxngClient } from "../clients/searxng.js";
import { generateCacheKey, withCache } from "../utils/cache.js";
import { config } from "../config.js";
import type { SearchParams, ToolResponse } from "../types/index.js";

export async function searchTool(args: any): Promise<ToolResponse> {
  try {
    const params: SearchParams = {
      query: args.query,
      engines: args.engines,
      categories: args.categories,
      language: args.language,
      page: args.page,
      safe_search: args.safe_search,
    };

    // Generate cache key
    const cacheKey = generateCacheKey("search", params);

    // Perform search with caching
    const results = await withCache(
      cacheKey,
      config.redis.ttl.search,
      async () => {
        return await searxngClient.search(params);
      }
    );

    // Format response
    const response = {
      query: params.query,
      total_results: results.length,
      engines_used: params.engines || ["all configured engines"],
      results: results.slice(0, 20).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content.substring(0, 300) + (r.content.length > 300 ? "..." : ""),
        engine: r.engine,
        score: r.score,
        published_date: r.publishedDate,
      })),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error("Search tool error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

import { crawl4aiClient } from "../clients/crawl4ai.js";
import { generateCacheKey, withCache } from "../utils/cache.js";
import { config } from "../config.js";
import type { CrawlParams, ToolResponse } from "../types/index.js";

export async function crawlTool(args: any): Promise<ToolResponse> {
  try {
    const params: CrawlParams = {
      url: args.url,
      extraction_strategy: args.extraction_strategy,
      chunking_strategy: args.chunking_strategy,
      screenshot: args.screenshot,
      wait_for: args.wait_for,
      timeout: args.timeout,
    };

    // Generate cache key (based on URL only for crawl)
    const cacheKey = generateCacheKey("crawl", { url: params.url });

    // Perform crawl with caching
    const result = await withCache(
      cacheKey,
      config.redis.ttl.crawl,
      async () => {
        return await crawl4aiClient.crawl(params);
      }
    );

    // Format response
    const response = {
      url: result.url,
      title: result.metadata.title,
      description: result.metadata.description,
      content_length: result.markdown.length,
      links_found: result.links.length,
      images_found: result.media.images.length,
      videos_found: result.media.videos.length,
      markdown_preview: result.markdown.substring(0, 1000) + (result.markdown.length > 1000 ? "..." : ""),
      full_markdown: result.markdown,
      links: result.links.slice(0, 20),
      images: result.media.images.slice(0, 10),
      timestamp: result.timestamp,
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
    console.error("Crawl tool error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Crawl failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

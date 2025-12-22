import { crawl4aiClient } from "../clients/crawl4ai.js";
import { getCached } from "../clients/redis.js";
import { generateCacheKey } from "../utils/cache.js";
import type { ExtractParams, CrawlResult, ToolResponse } from "../types/index.js";

export async function extractTool(args: any): Promise<ToolResponse> {
  try {
    const params: ExtractParams = {
      url: args.url,
      content_type: args.content_type,
      selector: args.selector,
    };

    // First try to get from cache
    const cacheKey = generateCacheKey("crawl", { url: params.url });
    let crawlResult = await getCached<CrawlResult>(cacheKey);

    // If not in cache, perform a fresh crawl
    if (!crawlResult) {
      crawlResult = await crawl4aiClient.crawl({
        url: params.url,
        extraction_strategy: "auto",
      });
    }

    let extractedContent: any;

    switch (params.content_type) {
      case "text":
        extractedContent = {
          type: "text",
          content: crawlResult.markdown,
          length: crawlResult.markdown.length,
        };
        break;

      case "links":
        extractedContent = {
          type: "links",
          links: crawlResult.links,
          count: crawlResult.links.length,
        };
        break;

      case "images":
        extractedContent = {
          type: "images",
          images: crawlResult.media.images,
          count: crawlResult.media.images.length,
        };
        break;

      case "videos":
        extractedContent = {
          type: "videos",
          videos: crawlResult.media.videos,
          count: crawlResult.media.videos.length,
        };
        break;

      case "code":
        // Extract code blocks from markdown
        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks = crawlResult.markdown.match(codeBlockRegex) || [];
        extractedContent = {
          type: "code",
          code_blocks: codeBlocks,
          count: codeBlocks.length,
        };
        break;

      default:
        throw new Error(`Unknown content type: ${params.content_type}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              url: params.url,
              content_type: params.content_type,
              ...extractedContent,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("Extract tool error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Content extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

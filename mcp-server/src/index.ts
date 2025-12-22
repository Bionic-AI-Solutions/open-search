#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { initializeRedis, closeRedis } from "./clients/redis.js";
import { searchTool, crawlTool, extractTool, analyzeTool } from "./tools/index.js";

// Create server instance
const server = new Server(
  {
    name: "mcp-search-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const tools: Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web using SearXNG meta-search engine. Aggregates results from multiple search engines including Google, DuckDuckGo, Brave, and more. Returns ranked results with titles, URLs, content snippets, and metadata.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string. Be specific for best results.",
        },
        engines: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional: Specific search engines to use (e.g., ['google', 'duckduckgo', 'brave']). If not specified, uses all configured engines.",
          default: [],
        },
        categories: {
          type: "string",
          description:
            "Search category: 'general' (default), 'images', 'videos', 'news', 'it', 'science'",
          default: "general",
        },
        language: {
          type: "string",
          description: "Search language code (e.g., 'en', 'es', 'fr', 'de')",
          default: "en",
        },
        page: {
          type: "number",
          description: "Page number for pagination (starts at 1)",
          default: 1,
        },
        safe_search: {
          type: "number",
          description: "Safe search level: 0=off, 1=moderate, 2=strict",
          default: 0,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_crawl",
    description:
      "Deep crawl and extract content from a URL using Crawl4AI. Supports JavaScript rendering, media extraction, and intelligent content parsing. Returns markdown-formatted content, links, images, videos, and metadata. Use this when you need the full content of a page, not just a search snippet.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to crawl (must be a valid HTTP/HTTPS URL)",
        },
        extraction_strategy: {
          type: "string",
          enum: ["auto", "llm", "cosine"],
          description:
            "Content extraction strategy: 'auto' (default, best for most pages), 'llm' (AI-powered extraction), 'cosine' (semantic similarity-based)",
          default: "auto",
        },
        chunking_strategy: {
          type: "string",
          enum: ["regex", "markdown", "sliding"],
          description:
            "How to chunk the extracted content: 'markdown' (default, preserves structure), 'regex' (pattern-based), 'sliding' (fixed-size windows)",
          default: "markdown",
        },
        screenshot: {
          type: "boolean",
          description: "Capture screenshot of the page (returned as base64)",
          default: false,
        },
        wait_for: {
          type: "string",
          description:
            "CSS selector to wait for before extraction (useful for dynamic content). Example: 'css:.main-content'",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (5-120)",
          default: 30,
        },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_content",
    description:
      "Extract specific content types from a URL. This is more targeted than web_crawl and optimized for specific content extraction tasks. Automatically uses cached data if available.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the page to extract content from",
        },
        content_type: {
          type: "string",
          enum: ["text", "links", "images", "videos", "code"],
          description:
            "Type of content to extract: 'text' (all text content), 'links' (all hyperlinks), 'images' (all image URLs), 'videos' (video URLs), 'code' (code blocks)",
        },
        selector: {
          type: "string",
          description:
            "Optional CSS selector for targeted extraction. Example: '.article-content' or '#main'",
        },
      },
      required: ["url", "content_type"],
    },
  },
  {
    name: "analyze_search_results",
    description:
      "Analyze and rank search results based on relevance, freshness, and authority. Provides detailed scoring and rankings to help identify the most useful results for a given query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Original search query to analyze results against",
        },
        results: {
          type: "array",
          description:
            "Array of search results to analyze (typically from web_search tool)",
        },
        criteria: {
          type: "object",
          properties: {
            relevance_weight: {
              type: "number",
              description: "Weight for relevance score (0-1, default: 0.5)",
              default: 0.5,
            },
            freshness_weight: {
              type: "number",
              description: "Weight for freshness score (0-1, default: 0.3)",
              default: 0.3,
            },
            authority_weight: {
              type: "number",
              description: "Weight for authority score (0-1, default: 0.2)",
              default: 0.2,
            },
          },
          description:
            "Scoring criteria weights (must sum to 1.0). Adjust to prioritize different factors.",
        },
      },
      required: ["query", "results"],
    },
  },
];

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    console.error(`[MCP] Tool called: ${name}`);

    switch (name) {
      case "web_search":
        return await searchTool(args);
      case "web_crawl":
        return await crawlTool(args);
      case "extract_content":
        return await extractTool(args);
      case "analyze_search_results":
        return await analyzeTool(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`[MCP] Tool error:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Main startup
async function main() {
  console.error("[MCP] Starting MCP Search Server...");

  // Initialize Redis
  try {
    await initializeRedis();
  } catch (error) {
    console.error("[MCP] Redis initialization failed (continuing without cache):", error);
  }

  // Create transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  console.error("[MCP] MCP Search Server running on stdio");
  console.error("[MCP] Available tools: web_search, web_crawl, extract_content, analyze_search_results");
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("[MCP] Shutting down...");
  await closeRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("[MCP] Shutting down...");
  await closeRedis();
  process.exit(0);
});

// Start server
main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});

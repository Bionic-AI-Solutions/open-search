#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { initializeRedis, closeRedis } from "./clients/redis.js";
import { searchTool, crawlTool, extractTool, analyzeTool } from "./tools/index.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

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

// Helper function to create and configure an MCP server
function createMcpServer(): Server {
  const mcpServer = new Server(
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

  // Register tool list handler
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
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

  return mcpServer;
}

// Transport management for HTTP/SSE
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Main startup
async function main() {
  console.error("[MCP] Starting MCP Search Server...");

  // Initialize Redis
  try {
    await initializeRedis();
  } catch (error) {
    console.error("[MCP] Redis initialization failed (continuing without cache):", error);
  }

  // Determine transport mode from environment
  const transportMode = process.env.MCP_TRANSPORT || "auto"; // "stdio", "http", or "auto"

  if (transportMode === "stdio" || (transportMode === "auto" && !process.env.PORT)) {
    // Use stdio transport (for local/spawned processes)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP] MCP Search Server running on stdio");
  } else {
    // Use HTTP/SSE transport (for remote access)
    const app = express();
    app.use(express.json());
    
    // Middleware to fix Accept header for clients that don't send it correctly (like IBM Gateway)
    app.use("/mcp", (req, res, next) => {
      const acceptHeader = req.headers.accept || req.headers["accept"] || "";
      if (!acceptHeader.includes("application/json") || !acceptHeader.includes("text/event-stream")) {
        // Add the required Accept header if missing or incomplete
        req.headers.accept = "application/json, text/event-stream";
        console.error(`[MCP] Fixed Accept header for ${req.method} ${req.path}: ${req.headers.accept}`);
      }
      next();
    });

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({ 
        status: "healthy", 
        service: "mcp-search-server",
        transport: "http",
        tools: tools.map(t => t.name)
      });
    });

    // Readiness check endpoint
    app.get("/ready", async (req, res) => {
      try {
        // Check Redis connection if enabled
        if (config.redis.enabled) {
          // Simple check - Redis client will throw if not connected
          // This is a basic check, you might want to add a ping
        }
        res.json({ status: "ready" });
      } catch (error) {
        res.status(503).json({ 
          status: "not ready", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    // MCP protocol endpoint - handles POST, GET, DELETE
    app.post("/mcp", async (req, res) => {
      console.error(`[MCP] POST /mcp - Headers:`, JSON.stringify(req.headers));
      console.error(`[MCP] POST /mcp - Body:`, JSON.stringify(req.body));
      
      // CRITICAL: Fix Accept header BEFORE calling handleRequest
      // The SDK checks Accept header internally and will reject if not correct
      const acceptHeader = req.headers.accept || req.headers["accept"] || "";
      if (!acceptHeader.includes("application/json") || !acceptHeader.includes("text/event-stream")) {
        // Force set the Accept header - Express may have already parsed it, so we need to override
        req.headers.accept = "application/json, text/event-stream";
        // Also set it on the raw headers object if it exists
        if ((req as any).rawHeaders) {
          const rawHeaders = (req as any).rawHeaders;
          for (let i = 0; i < rawHeaders.length; i += 2) {
            if (rawHeaders[i].toLowerCase() === "accept") {
              rawHeaders[i + 1] = "application/json, text/event-stream";
              break;
            }
          }
        }
        console.error(`[MCP] Fixed Accept header: ${req.headers.accept}`);
      }
      
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing session
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session initialization
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (id) => {
            transports[id] = transport;
            console.error(`[MCP] Session initialized: ${id}`);
          },
          onsessionclosed: (id) => {
            delete transports[id];
            console.error(`[MCP] Session closed: ${id}`);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        // Create and connect server for this session
        const sessionServer = createMcpServer();
        await sessionServer.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid session or missing initialize request" },
          id: null,
        });
        return;
      }

      // The SDK's handleRequest converts Express req to Web API Request internally
      // We need to ensure Accept header is in the original request before conversion
      // Monkey-patch the headers object to intercept get() calls
      const originalHeaders = req.headers;
      const headersProxy = {
        ...originalHeaders,
        get: (name: string) => {
          if (name.toLowerCase() === 'accept') {
            return 'application/json, text/event-stream';
          }
          // For other headers, check both lowercase and original case
          const lowerName = name.toLowerCase();
          return (originalHeaders as any)[lowerName] || (originalHeaders as any)[name];
        }
      };
      
      // Replace the headers object
      (req as any).headers = headersProxy;
      
      await transport.handleRequest(req as any, res, req.body);
    });

    // GET endpoint for streaming responses
    app.get("/mcp", async (req, res) => {
      const sessionId = req.headers["mcp-session-id"] as string;
      const transport = transports[sessionId];
      if (transport) {
        await transport.handleRequest(req, res);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid session" },
          id: null,
        });
      }
    });

    // DELETE endpoint for closing sessions
    app.delete("/mcp", async (req, res) => {
      const sessionId = req.headers["mcp-session-id"] as string;
      const transport = transports[sessionId];
      if (transport) {
        await transport.handleRequest(req, res);
        delete transports[sessionId];
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid session" },
          id: null,
        });
      }
    });

    const port = config.server.port;
    app.listen(port, "0.0.0.0", () => {
      console.error(`[MCP] MCP Search Server running on HTTP port ${port}`);
      console.error(`[MCP] Health check: http://0.0.0.0:${port}/health`);
      console.error(`[MCP] MCP endpoint: http://0.0.0.0:${port}/mcp`);
      console.error("[MCP] Available tools: web_search, web_crawl, extract_content, analyze_search_results");
    });
  }
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

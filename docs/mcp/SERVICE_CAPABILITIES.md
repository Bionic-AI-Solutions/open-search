# MCP Service - Current Capabilities

## Overview

Your MCP (Model Context Protocol) service provides **4 tools** that enable AI agents and LLMs to search the web and extract content. It's a **replacement for commercial APIs like Tavily**, using open-source infrastructure.

## Current Status

✅ **Running**: 3 replicas in `search-infrastructure` namespace  
✅ **Service**: LoadBalancer at `192.168.0.215:3000`  
✅ **Backend Services**: SearXNG and Crawl4AI are operational  

## Available Tools

### 1. `web_search` 🔍
**Purpose**: Search the web using SearXNG meta-search engine

**What it does**:
- Aggregates results from 70+ search engines (Google, DuckDuckGo, Brave, Bing, etc.)
- Returns ranked results with titles, URLs, content snippets, and metadata
- Supports filtering by specific engines, categories, language, and safe search

**Parameters**:
- `query` (required): Search query string
- `engines` (optional): Specific engines to use (e.g., `["google", "duckduckgo"]`)
- `categories` (optional): Search categories (general, images, videos, etc.)
- `language` (optional): Language code (e.g., "en", "es")
- `page` (optional): Page number for pagination
- `safe_search` (optional): Safe search level (0-2)

**Returns**:
- JSON with search results including:
  - Title, URL, content snippet
  - Source engine
  - Relevance score
  - Published date (if available)

**Use Case**: "Find the latest news about AI", "Search for Python tutorials", etc.

---

### 2. `web_crawl` 🕷️
**Purpose**: Crawl and extract content from webpages using Crawl4AI

**What it does**:
- Fetches webpage content
- Extracts clean markdown/text
- Identifies links, images, videos
- Extracts metadata (title, description, keywords)
- Optional screenshot capture

**Parameters**:
- `url` (required): URL to crawl
- `extraction_strategy` (optional): How to extract content (auto, cosine_clustering, llm_extraction)
- `chunking_strategy` (optional): How to chunk content (markdown, semantic, etc.)
- `screenshot` (optional): Take a screenshot (boolean)
- `wait_for` (optional): Wait for specific elements to load
- `timeout` (optional): Request timeout in seconds

**Returns**:
- JSON with:
  - Full markdown content
  - HTML (if requested)
  - All links found
  - Images and videos
  - Metadata (title, description, keywords)
  - Screenshot (if requested)

**Use Case**: "Extract content from this article", "Get all links from this page", etc.

---

### 3. `extract_content` 📄
**Purpose**: Extract specific content from a webpage using selectors or AI

**What it does**:
- Extracts content using CSS selectors
- Or uses AI-powered extraction
- Returns structured content

**Parameters**:
- `url` (required): URL to extract from
- `selector` (optional): CSS selector for specific elements

**Returns**:
- Extracted content in structured format

**Use Case**: "Extract just the main article text", "Get the table of contents", etc.

---

### 4. `analyze_search_results` 📊
**Purpose**: Analyze and summarize search results

**What it does**:
- Takes search results
- Analyzes patterns, themes, relevance
- Provides summaries and insights

**Parameters**:
- Search results data

**Returns**:
- Analysis and insights about the search results

**Use Case**: "Summarize these search results", "What are the main themes?", etc.

---

## Infrastructure

### Backend Services

1. **SearXNG** (`searxng:8080`)
   - Meta-search engine aggregating 70+ search engines
   - Privacy-focused, no tracking
   - Self-hosted, unlimited searches

2. **Crawl4AI** (`crawl4ai:8000`)
   - Advanced web crawling with AI-powered extraction
   - Handles JavaScript-rendered pages
   - Multiple extraction strategies

3. **Redis** (optional caching)
   - Caches search results (1 hour TTL)
   - Caches crawled content (24 hour TTL)
   - Reduces load on backend services

### Deployment

- **Namespace**: `search-infrastructure`
- **Replicas**: 3 (for high availability)
- **Service Type**: LoadBalancer
- **External IP**: `192.168.0.215:3000`
- **Internal**: `mcp-server.search-infrastructure.svc.cluster.local:3000`

---

## What This Replaces

### Commercial APIs You No Longer Need:
- ❌ **Tavily API** - Replaced by `web_search` + `web_crawl`
- ❌ **Brave Search API** - SearXNG includes Brave
- ❌ **Serper API** - SearXNG includes Google
- ❌ **Firecrawl API** - Replaced by `web_crawl`

### Benefits:
- ✅ **No API costs** - Unlimited searches
- ✅ **Privacy** - No tracking, self-hosted
- ✅ **Control** - Full control over search engines and extraction
- ✅ **Scalable** - Kubernetes-ready with auto-scaling

---

## How to Use

### Via MCP Client (Cursor, Claude Desktop, etc.)

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "http",
      "url": "http://192.168.0.215:3000/mcp"
    }
  }
}
```

### Via IBM Gateway

- URL: `http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp`
- Transport: `HTTP` or `SSE`

### Direct API Calls

```bash
# Initialize session
curl -X POST http://192.168.0.215:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    },
    "id": 1
  }'
```

---

## Current Limitations

1. **Gateway Connection Issues**: IBM Gateway has Accept header compatibility issues (being addressed with FastMCP migration)

2. **TypeScript Complexity**: Current implementation is complex (400+ lines) - FastMCP migration will simplify to ~200 lines

3. **Transport Handling**: Manual HTTP/SSE handling - FastMCP handles this automatically

---

## Future Improvements (FastMCP Migration)

The new FastMCP server will provide:
- ✅ Same 4 tools (or 2 core tools: search + crawl)
- ✅ Simpler codebase (~200 lines vs 400+)
- ✅ Automatic transport handling
- ✅ No gateway compatibility issues
- ✅ Easier to maintain and extend

---

## Summary

**Today, your MCP service provides**:
1. ✅ Web search across 70+ engines (replaces Tavily)
2. ✅ Web crawling with AI extraction (replaces Firecrawl)
3. ✅ Content extraction with selectors
4. ✅ Search result analysis
5. ✅ Redis caching for performance
6. ✅ High availability (3 replicas)
7. ✅ Self-hosted, privacy-focused, unlimited usage

**It's a complete replacement for commercial search/crawl APIs**, giving you full control and eliminating API costs.


# MCP Server Client Setup Guide

This guide explains how to use the open-search MCP server with various clients, including Cursor, Claude Desktop, and other MCP-compatible applications.

## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Cursor Setup](#cursor-setup)
- [Claude Desktop Setup](#claude-desktop-setup)
- [Other MCP Clients](#other-mcp-clients)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The open-search MCP server provides AI agents with powerful web search and content extraction capabilities through the Model Context Protocol (MCP). It integrates with:

- **SearXNG**: Meta-search engine aggregating results from 70+ search engines
- **Crawl4AI**: Advanced web crawling with AI-powered content extraction
- **Redis**: Caching layer for improved performance

## 📦 Prerequisites

### Option 1: Using Deployed Server (Recommended)

If you have the server deployed in Kubernetes:

1. **Port-forward the MCP server service:**
   ```bash
   kubectl port-forward -n search-infrastructure svc/mcp-server 3000:3000
   ```

2. **Note the connection details:**
   - Host: `localhost` (or your cluster endpoint)
   - Port: `3000`
   - Protocol: `stdio` (MCP protocol)

### Option 2: Local Development

If running locally via Docker Compose:

```bash
cd /path/to/open-search
docker-compose up -d mcp-server
```

The server will be available on `localhost:3000` via stdio.

### Option 3: Direct Node.js Execution

```bash
cd /path/to/open-search/mcp-server
npm install
npm run build
node dist/index.js
```

## 🖥️ Cursor Setup

Cursor supports MCP servers through its configuration. Here's how to set it up:

### Step 1: Locate Cursor Configuration

Cursor's MCP configuration is typically located at:
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/mcp.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp.json`

### Step 2: Configure MCP Server

Create or edit the MCP configuration file:

```json
{
  "mcpServers": {
    "open-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/open-search/mcp-server/dist/index.js"
      ],
      "env": {
        "SEARXNG_URL": "http://localhost:8080",
        "CRAWL4AI_URL": "http://localhost:8000",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": "",
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Step 3: For Kubernetes Deployment

If using the Kubernetes deployment, you'll need to:

1. **Create a local wrapper script** (`mcp-server-wrapper.sh`):

```bash
#!/bin/bash
# Wrapper to connect to Kubernetes MCP server via port-forward

# Start port-forward in background
kubectl port-forward -n search-infrastructure svc/mcp-server 3000:3000 &
PF_PID=$!

# Wait for port-forward to be ready
sleep 2

# Connect via stdio (MCP protocol)
# Note: MCP uses stdio, so we need to proxy it
exec node /path/to/open-search/mcp-server/dist/index.js
```

2. **Update Cursor config to use wrapper:**

```json
{
  "mcpServers": {
    "open-search": {
      "command": "/absolute/path/to/mcp-server-wrapper.sh",
      "env": {
        "SEARXNG_URL": "http://searxng:8080",
        "CRAWL4AI_URL": "http://crawl4ai:8000",
        "REDIS_HOST": "mcp-database.redis.svc.cluster.local",
        "REDIS_PORT": "10515",
        "REDIS_PASSWORD": "your-redis-password"
      }
    }
  }
}
```

### Step 4: Restart Cursor

After configuring, restart Cursor to load the MCP server.

## 💬 Claude Desktop Setup

Claude Desktop has built-in MCP support. Configure it as follows:

### macOS Configuration

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Windows Configuration

Edit: `%APPDATA%\Claude\claude_desktop_config.json`

### Linux Configuration

Edit: `~/.config/Claude/claude_desktop_config.json`

### Configuration Example

```json
{
  "mcpServers": {
    "open-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/open-search/mcp-server/dist/index.js"
      ],
      "env": {
        "SEARXNG_URL": "http://localhost:8080",
        "CRAWL4AI_URL": "http://localhost:8000",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": "",
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## 🔧 Other MCP Clients

### Using with MCP SDK (Programmatic)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

// Spawn the MCP server
const serverProcess = spawn("node", [
  "/path/to/open-search/mcp-server/dist/index.js"
], {
  env: {
    ...process.env,
    SEARXNG_URL: "http://localhost:8080",
    CRAWL4AI_URL: "http://localhost:8000",
  }
});

// Create transport
const transport = new StdioClientTransport({
  command: serverProcess,
  args: [],
});

// Create client
const client = new Client({
  name: "my-client",
  version: "1.0.0",
}, {
  capabilities: {},
});

// Connect
await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log("Available tools:", tools.tools);

// Call a tool
const result = await client.callTool({
  name: "web_search",
  arguments: {
    query: "latest AI news",
    maxResults: 5
  }
});

console.log("Search results:", result);
```

## 🛠️ Available Tools

The MCP server provides the following tools:

### 1. `web_search`

Search the web using SearXNG meta-search engine.

**Parameters:**
- `query` (string, required): Search query
- `engines` (array, optional): Specific engines to use (e.g., `["google", "duckduckgo"]`)
- `categories` (string, optional): Search category (`general`, `images`, `videos`, `news`, `it`, `science`)
- `language` (string, optional): Language code (default: `en`)
- `page` (number, optional): Page number (default: 1)
- `safe_search` (number, optional): Safe search level (0=off, 1=moderate, 2=strict)

**Example:**
```json
{
  "name": "web_search",
  "arguments": {
    "query": "latest AI developments 2024",
    "engines": ["google", "duckduckgo"],
    "language": "en",
    "maxResults": 10
  }
}
```

### 2. `web_crawl`

Deep crawl and extract content from URLs using Crawl4AI.

**Parameters:**
- `url` (string, required): URL to crawl
- `extraction_strategy` (string, optional): `auto`, `llm`, or `cosine` (default: `auto`)
- `chunking_strategy` (string, optional): `regex`, `markdown`, or `sliding` (default: `markdown`)
- `screenshot` (boolean, optional): Capture screenshot (default: `false`)
- `wait_for` (string, optional): CSS selector to wait for
- `timeout` (number, optional): Timeout in seconds (default: 30)

**Example:**
```json
{
  "name": "web_crawl",
  "arguments": {
    "url": "https://example.com/article",
    "extraction_strategy": "llm",
    "screenshot": false
  }
}
```

### 3. `extract_content`

Extract specific content types from a URL.

**Parameters:**
- `url` (string, required): URL to extract from
- `content_type` (string, required): `text`, `links`, `images`, `videos`, or `code`
- `selector` (string, optional): CSS selector for targeted extraction

**Example:**
```json
{
  "name": "extract_content",
  "arguments": {
    "url": "https://example.com",
    "content_type": "links"
  }
}
```

### 4. `analyze_search_results`

Analyze and rank search results based on relevance, freshness, and authority.

**Parameters:**
- `query` (string, required): Original search query
- `results` (array, required): Search results to analyze
- `criteria` (object, optional): Scoring weights
  - `relevance_weight` (number, default: 0.5)
  - `freshness_weight` (number, default: 0.3)
  - `authority_weight` (number, default: 0.2)

**Example:**
```json
{
  "name": "analyze_search_results",
  "arguments": {
    "query": "AI news",
    "results": [...],
    "criteria": {
      "relevance_weight": 0.6,
      "freshness_weight": 0.3,
      "authority_weight": 0.1
    }
  }
}
```

## 📝 Usage Examples

### Example 1: Basic Web Search

**In Cursor/Claude:**
```
User: "Search for the latest news about AI breakthroughs"
Agent: [Calls web_search tool]
       Returns: List of relevant articles with titles, URLs, and snippets
```

### Example 2: Deep Content Extraction

**In Cursor/Claude:**
```
User: "Get the full content from this article: https://example.com/article"
Agent: [Calls web_crawl tool]
       Returns: Full markdown content, links, images, and metadata
```

### Example 3: Multi-Step Research

**In Cursor/Claude:**
```
User: "Research the latest developments in quantum computing and summarize the top 3 articles"
Agent: 
  1. [Calls web_search] - Finds articles
  2. [Calls analyze_search_results] - Ranks by relevance
  3. [Calls web_crawl] - Extracts content from top 3
  4. [Summarizes] - Provides comprehensive summary
```

## 🔍 Troubleshooting

### Issue: MCP Server Not Connecting

**Symptoms:**
- Cursor/Claude shows "MCP server unavailable"
- No tools appear in the client

**Solutions:**
1. **Check server is running:**
   ```bash
   # For Kubernetes
   kubectl get pods -n search-infrastructure -l app=mcp-server
   
   # For Docker
   docker ps | grep mcp-server
   
   # For local
   ps aux | grep "node.*index.js"
   ```

2. **Verify configuration path:**
   - Ensure the path to `dist/index.js` is absolute
   - Check that the file exists and is executable

3. **Check environment variables:**
   - Verify `SEARXNG_URL` and `CRAWL4AI_URL` are correct
   - Ensure services are accessible from the MCP server

4. **Check logs:**
   ```bash
   # Kubernetes
   kubectl logs -n search-infrastructure -l app=mcp-server --tail=50
   
   # Docker
   docker logs mcp-server
   ```

### Issue: Tools Not Available

**Symptoms:**
- MCP server connects but no tools are listed

**Solutions:**
1. **Verify server initialization:**
   - Check logs for "Available tools: web_search, web_crawl..."
   - Ensure Redis connection (if caching is enabled)

2. **Check tool registration:**
   - Verify `tools/list` endpoint returns tools
   - Check for TypeScript compilation errors

### Issue: Search Returns No Results

**Symptoms:**
- `web_search` tool called but returns empty results

**Solutions:**
1. **Check SearXNG:**
   ```bash
   curl "http://localhost:8080/search?q=test&format=json"
   ```

2. **Verify network connectivity:**
   - MCP server can reach SearXNG
   - SearXNG can reach external search engines

3. **Check SearXNG logs:**
   ```bash
   kubectl logs -n search-infrastructure -l app=searxng --tail=50
   ```

### Issue: Crawl Timeouts

**Symptoms:**
- `web_crawl` tool times out

**Solutions:**
1. **Increase timeout:**
   ```json
   {
     "name": "web_crawl",
     "arguments": {
       "url": "https://example.com",
       "timeout": 60
     }
   }
   ```

2. **Check Crawl4AI service:**
   ```bash
   kubectl get pods -n search-infrastructure -l app=crawl4ai
   kubectl logs -n search-infrastructure -l app=crawl4ai --tail=50
   ```

### Issue: Redis Connection Errors

**Symptoms:**
- Logs show "Redis Client Error" or "Max reconnection attempts"

**Solutions:**
1. **Verify Redis is accessible:**
   ```bash
   kubectl get svc -n redis mcp-database
   ```

2. **Check credentials:**
   - Verify `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
   - Test connection manually

3. **Disable caching (temporary):**
   ```json
   {
     "env": {
       "REDIS_ENABLED": "false"
     }
   }
   ```

## 📚 Additional Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Cursor MCP Guide](https://docs.cursor.com/mcp)
- [Claude Desktop MCP Setup](https://claude.ai/docs/mcp)
- [SearXNG Documentation](https://docs.searxng.org/)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review server logs for error messages
3. Verify all services are running and accessible
4. Open an issue on GitHub: https://github.com/Bionic-AI-Solutions/open-search/issues

---

**Happy searching! 🔍**


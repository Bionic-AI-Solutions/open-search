# MCP Server Documentation

## Overview

The MCP (Model Context Protocol) server exposes SearXNG and Crawl4AI tools to AI agents and LLMs, providing a complete replacement for commercial search APIs like Tavily.

## Quick Links

- **[Usage Guide](./USAGE_GUIDE.md)** - **📖 Complete usage guide with examples and remote client setup**
- **[Quick Start Guide](./QUICK_START.md)** - Get started in 5 minutes
- **[Service Capabilities](./SERVICE_CAPABILITIES.md)** - What tools are available
- **[Client Setup](./CLIENT_SETUP.md)** - Configure MCP clients (Cursor, Claude Desktop, etc.)
- **[Gateway Setup](./GATEWAY_SETUP.md)** - Configure IBM MCP Gateway
- **[FastMCP Migration](./FASTMCP_MIGRATION.md)** - Migration from TypeScript to FastMCP

## Current Implementation

**FastMCP Server** (Python) - ✅ **Active**

- Location: `/workspace/mcp-server-fastmcp/`
- Status: Deployed and running
- Tools: 4 tools (web_search, web_crawl, extract_content, analyze_search_results)
- Transport: SSE/HTTP (automatic)

## Architecture

```
MCP Client → FastMCP Server (Python) → SearXNG / Crawl4AI
                                      → Redis (optional cache)
```

**Simple, clean, and working!**

## Deployment

- **Namespace**: `search-infrastructure`
- **Service**: `mcp-server-fastmcp`
- **External IP**: `192.168.0.215:8000`
- **Internal**: `mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000`

## Tools Available

1. **web_search** - Search using SearXNG meta-search engine
2. **web_crawl** - Crawl webpages using Crawl4AI
3. **extract_content** - Extract specific content from pages
4. **analyze_search_results** - Analyze and score search results

See [Service Capabilities](./SERVICE_CAPABILITIES.md) for details.


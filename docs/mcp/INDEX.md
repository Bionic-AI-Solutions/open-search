# MCP Server Documentation Index

## 📚 Quick Navigation

### Getting Started
- **[README](./README.md)** - Overview and quick links
- **[Quick Start](./QUICK_START.md)** - Get started in 5 minutes
- **[FastMCP Setup](./FASTMCP_SETUP.md)** - FastMCP server setup

### Reference
- **[Service Capabilities](./SERVICE_CAPABILITIES.md)** - Available tools and features
- **[Client Setup](./CLIENT_SETUP.md)** - Configure MCP clients (Cursor, Claude Desktop, etc.)
- **[Gateway Setup](./GATEWAY_SETUP.md)** - IBM MCP Gateway configuration

### Migration & Details
- **[FastMCP Migration](./FASTMCP_MIGRATION.md)** - Migration from TypeScript to FastMCP
- **[Complete Tools](./FASTMCP_COMPLETE_TOOLS.md)** - Detailed tool documentation
- **[Deployment Success](./FASTMCP_DEPLOYMENT_SUCCESS.md)** - Deployment status and verification

## 🎯 Current Status

**Active Server**: FastMCP (Python)
- **Status**: ✅ Running (3/3 pods)
- **Service**: `mcp-server-fastmcp`
- **External**: `192.168.0.220:8000`
- **Internal**: `mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000`

## 🛠️ Available Tools

1. **web_search** - Search using SearXNG meta-search engine
2. **web_crawl** - Crawl webpages using Crawl4AI
3. **extract_content** - Extract specific content from pages
4. **analyze_search_results** - Analyze and score search results

See [Service Capabilities](./SERVICE_CAPABILITIES.md) for full details.


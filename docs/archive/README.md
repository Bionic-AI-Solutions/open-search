# Archive - Deprecated Documentation

This directory contains deprecated documentation and old implementations that are no longer in use.

## Contents

### Old TypeScript MCP Server
- `mcp-server-typescript/` - Original TypeScript implementation (replaced by FastMCP)

### Deprecated Documentation
- `MCP_IBM_GATEWAY_SETUP.md` - Old gateway setup (superseded by simplified guide)
- `MCP_HTTP_GATEWAY.md` - HTTP gateway implementation (no longer needed)
- `MCP_HTTP_NATIVE_SUPPORT.md` - HTTP/SSE migration docs (completed)
- `MCP_REMOTE_ACCESS.md` - Remote access guides (consolidated)
- `MCP_GATEWAY_CONNECTION_*.md` - Gateway troubleshooting (resolved)

## Current Implementation

**Active**: FastMCP server (Python) in `/workspace/mcp-server-fastmcp/`

**Documentation**: See `/workspace/docs/mcp/` for current documentation

## Migration

All functionality has been migrated to FastMCP. The old TypeScript server has been removed from Kubernetes and archived here for reference only.


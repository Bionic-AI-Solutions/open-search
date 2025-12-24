# MCP Gateway Connection Fix Summary

## Issue
The IBM MCP Gateway was unable to connect to the MCP server, getting "Failed to Initialize gateway" errors.

## Root Causes Identified

1. **Missing `/mcp` endpoint path**: Gateway was configured with URLs like `http://mcp-server:3000` instead of `http://mcp-server:3000/mcp`

2. **Wrong port**: Some gateway configurations used port `80` instead of `3000`

3. **Accept header requirement**: The MCP SDK's `StreamableHTTPServerTransport` requires clients to send an `Accept` header that includes both `application/json` and `text/event-stream`. The IBM Gateway was not sending this header, causing 406 Not Acceptable errors.

## Fixes Applied

### 1. Accept Header Middleware
Added Express middleware to automatically fix the `Accept` header for clients that don't send it correctly:

```typescript
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
```

### 2. Enhanced Logging
Added detailed logging to track incoming requests:
- Log all headers and body for POST requests to `/mcp`
- Log when Accept header is fixed
- Log session initialization and closure

### 3. Gateway Configuration
Updated gateway configuration documentation to use correct URL format:
- **Internal:** `http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp`
- **External:** `http://192.168.0.215:3000/mcp`

## Current Status

✅ **MCP Server**: Running and healthy
✅ **Accept Header Fix**: Deployed and active
✅ **Logging**: Enhanced for debugging
✅ **Gateway Configuration**: Needs to be updated via admin UI

## Next Steps

1. **Update Gateway Configuration** (via Admin UI):
   - Go to `https://mcp.bionicaisolutions.com/admin/login`
   - Navigate to **Servers** → Find your MCP server
   - Update URL to: `http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp`
   - Ensure Transport is set to `HTTP` or `SSE`
   - Save and test connection

2. **Verify Connection**:
   ```bash
   # Check gateway logs
   kubectl logs -n mcp-gateway -l app=mcp-context-forge --tail=50 | grep -i "initialize\|error"
   
   # Check MCP server logs for incoming requests
   kubectl logs -n search-infrastructure -l app=mcp-server --tail=50 | grep -E "POST /mcp|Fixed Accept"
   ```

## Technical Details

### MCP SDK Requirements
The `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport` requires:
- Client must send `Accept: application/json, text/event-stream` header
- Server responds with `Content-Type: text/event-stream`
- Uses Server-Sent Events (SSE) for streaming responses

### Why IBM Gateway Failed
The IBM Gateway was likely:
1. Not sending the required `Accept` header
2. Or sending only `Accept: application/json`
3. This caused the SDK to return `406 Not Acceptable` error

### Solution
The middleware intercepts requests before they reach the SDK's `handleRequest` method, ensuring the `Accept` header is always correct. This makes the server compatible with clients that don't strictly follow the MCP protocol requirements.

## Files Modified

- `/workspace/mcp-server/src/index.ts`: Added Accept header middleware and enhanced logging
- `/workspace/MCP_GATEWAY_CONNECTION_FIX.md`: Created fix documentation

## Deployment

- Image: `docker4zerocool/mcp-search-server:latest`
- Namespace: `search-infrastructure`
- Replicas: 3
- Status: ✅ Deployed and running


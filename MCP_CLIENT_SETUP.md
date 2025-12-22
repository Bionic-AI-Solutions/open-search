# MCP Server Client Setup Guide

This guide explains how to use the open-search MCP server with various clients, including Cursor, Claude Desktop, and other MCP-compatible applications.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture Understanding](#architecture-understanding)
- [Connecting from Same Cluster](#connecting-from-same-cluster)
- [Connecting from Local Machine (Cursor/Claude)](#connecting-from-local-machine-cursorclaude)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The open-search MCP server provides AI agents with powerful web search and content extraction capabilities through the Model Context Protocol (MCP). It integrates with:

- **SearXNG**: Meta-search engine aggregating results from 70+ search engines
- **Crawl4AI**: Advanced web crawling with AI-powered content extraction
- **Redis**: Caching layer for improved performance

## 🏗️ Architecture Understanding

**Important:** MCP uses **stdio transport**, not HTTP. This means:

- The MCP server communicates via stdin/stdout (standard input/output)
- You cannot directly connect via HTTP URL like `http://mcp-server:3000`
- Clients must spawn the MCP server process and communicate via stdio pipes
- For Kubernetes deployments, you need to either:
  1. **Port-forward** the pod and connect via stdio locally
  2. **Exec into the pod** and run the client there
  3. **Create a wrapper** that proxies stdio communication

## 🔗 Connecting from Same Cluster

If your client is running **inside the same Kubernetes cluster**, you have a few options:

### Option 1: Direct Pod Execution (Recommended for Cluster Clients)

If you're running a client application in the cluster, you can exec into the MCP server pod:

```bash
# Get the MCP server pod name
MCP_POD=$(kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}')

# Exec into the pod and run your client
kubectl exec -it -n search-infrastructure $MCP_POD -- node /app/dist/index.js
```

### Option 2: Sidecar Pattern

Run your MCP client as a sidecar container in the same pod:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-with-mcp
spec:
  template:
    spec:
      containers:
      - name: my-app
        image: my-app:latest
      - name: mcp-server
        image: docker4zerocool/mcp-search-server:latest
        env:
        - name: SEARXNG_URL
          value: "http://searxng:8080"
        - name: CRAWL4AI_URL
          value: "http://crawl4ai:8000"
        # ... other env vars
```

Then your app can communicate with the MCP server via stdio within the pod.

### Option 3: Create an HTTP Gateway (Advanced)

If you need HTTP access from within the cluster, create a gateway service that translates HTTP to MCP stdio:

```typescript
// http-mcp-gateway.ts
import express from 'express';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

// Spawn MCP server process
const mcpProcess = spawn('node', ['/app/dist/index.js'], {
  env: {
    SEARXNG_URL: process.env.SEARXNG_URL || 'http://searxng:8080',
    CRAWL4AI_URL: process.env.CRAWL4AI_URL || 'http://crawl4ai:8000',
  }
});

// Handle MCP protocol over HTTP
app.post('/mcp/call', async (req, res) => {
  // Translate HTTP request to MCP stdio protocol
  // This requires implementing MCP protocol handling
});

app.listen(3000);
```

## 💻 Connecting from Local Machine (Cursor/Claude)

If you're running Cursor or Claude Desktop on your **local machine** and want to connect to the Kubernetes MCP server:

### Step 1: Port-Forward the MCP Server Pod

Since MCP uses stdio, you need to port-forward the pod and connect via stdio:

```bash
# Get the MCP server pod name
MCP_POD=$(kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}')

# Port-forward the pod (MCP uses stdio, but we can forward the process)
kubectl port-forward -n search-infrastructure pod/$MCP_POD 3000:3000
```

**However**, MCP doesn't actually use port 3000 for communication - it uses stdio. So you need a different approach:

### Step 2: Create a Local Wrapper Script

Create a wrapper script that connects to the Kubernetes pod via `kubectl exec`:

**`mcp-server-k8s-wrapper.sh`:**

```bash
#!/bin/bash
# Wrapper to connect to Kubernetes MCP server via kubectl exec

# Get the MCP server pod name
MCP_POD=$(kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}')

if [ -z "$MCP_POD" ]; then
  echo "Error: MCP server pod not found" >&2
  exit 1
fi

# Exec into the pod and run the MCP server
# kubectl exec streams stdin/stdout, which is perfect for MCP
kubectl exec -i -n search-infrastructure $MCP_POD -- node /app/dist/index.js
```

Make it executable:
```bash
chmod +x mcp-server-k8s-wrapper.sh
```

### Step 3: Configure Cursor

Edit Cursor's MCP configuration:

**macOS:** `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`  
**Linux:** `~/.config/Cursor/User/globalStorage/mcp.json`  
**Windows:** `%APPDATA%\Cursor\User\globalStorage\mcp.json`

```json
{
  "mcpServers": {
    "open-search": {
      "command": "/absolute/path/to/mcp-server-k8s-wrapper.sh",
      "env": {
        "KUBECONFIG": "/path/to/your/kubeconfig"
      }
    }
  }
}
```

### Step 4: Alternative - Use Local MCP Server with Remote Services

If the wrapper approach doesn't work, run the MCP server locally but point it to your Kubernetes services:

1. **Port-forward the services:**
   ```bash
   # Terminal 1: SearXNG
   kubectl port-forward -n search-infrastructure svc/searxng 8080:8080
   
   # Terminal 2: Crawl4AI
   kubectl port-forward -n search-infrastructure svc/crawl4ai 8000:8000
   
   # Terminal 3: Redis (if needed)
   kubectl port-forward -n redis svc/mcp-database 6379:10515
   ```

2. **Run MCP server locally:**
   ```bash
   cd /path/to/open-search/mcp-server
   npm install
   npm run build
   
   SEARXNG_URL=http://localhost:8080 \
   CRAWL4AI_URL=http://localhost:8000 \
   REDIS_HOST=localhost \
   REDIS_PORT=6379 \
   node dist/index.js
   ```

3. **Configure Cursor to use local server:**
   ```json
   {
     "mcpServers": {
       "open-search": {
         "command": "node",
         "args": ["/absolute/path/to/open-search/mcp-server/dist/index.js"],
         "env": {
           "SEARXNG_URL": "http://localhost:8080",
           "CRAWL4AI_URL": "http://localhost:8000",
           "REDIS_HOST": "localhost",
           "REDIS_PORT": "6379"
         }
       }
     }
   }
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

   # Check logs
   kubectl logs -n search-infrastructure -l app=mcp-server --tail=50
   ```

2. **Verify kubectl access:**

   ```bash
   # Test kubectl can access the cluster
   kubectl get pods -n search-infrastructure
   
   # Test exec works
   kubectl exec -n search-infrastructure -l app=mcp-server -- echo "test"
   ```

3. **Check wrapper script:**

   - Ensure the wrapper script is executable: `chmod +x mcp-server-k8s-wrapper.sh`
   - Test the wrapper manually: `./mcp-server-k8s-wrapper.sh`
   - Verify it can find the pod

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
   # From within cluster
   kubectl run test-searxng --image=curlimages/curl --rm -i --restart=Never -n search-infrastructure -- \
     curl "http://searxng:8080/search?q=test&format=json"
   ```

2. **Verify network connectivity:**

   - MCP server can reach SearXNG
   - SearXNG can reach external search engines

3. **Check SearXNG logs:**

   ```bash
   kubectl logs -n search-infrastructure -l app=searxng --tail=50
   ```

### Issue: kubectl exec Permission Denied

**Symptoms:**

- Wrapper script fails with permission errors

**Solutions:**

1. **Check RBAC permissions:**

   ```bash
   kubectl auth can-i exec pods -n search-infrastructure
   ```

2. **Verify kubeconfig:**

   - Ensure `KUBECONFIG` env var is set correctly
   - Or use default `~/.kube/config`

## 📚 Additional Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Cursor MCP Guide](https://docs.cursor.com/mcp)
- [Claude Desktop MCP Setup](https://claude.ai/docs/mcp)
- [Kubernetes Exec Documentation](https://kubernetes.io/docs/reference/generated/kubectl/kubectl-commands#exec)

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review server logs: `kubectl logs -n search-infrastructure -l app=mcp-server`
3. Verify all services are running: `kubectl get pods -n search-infrastructure`
4. Open an issue on GitHub: https://github.com/Bionic-AI-Solutions/open-search/issues

---

**Happy searching! 🔍**

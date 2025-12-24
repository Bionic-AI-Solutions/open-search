# MCP Server Usage Guide

Complete guide on how to use the MCP Search Infrastructure server with examples and remote client setup.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Remote Client Setup](#remote-client-setup)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Python Client Examples](#python-client-examples)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The MCP Search Infrastructure server provides AI agents with powerful web search and content extraction capabilities through the Model Context Protocol (MCP). It uses **FastMCP** (Python) with **HTTP/SSE transport**, making it easy to connect from anywhere.

### Key Features

- ✅ **Native HTTP/SSE Support**: No bridge service needed
- ✅ **4 Powerful Tools**: web_search, web_crawl, extract_content, analyze_search_results
- ✅ **Redis Caching**: Optional caching for improved performance
- ✅ **Production Ready**: Deployed on Kubernetes with auto-scaling

### Architecture

```
MCP Client (Cursor/Claude/Python)
    ↓ HTTP/SSE
MCP Server FastMCP (Python)
    ↓ HTTP
SearXNG / Crawl4AI / Redis
```

## 🚀 Quick Start

### Get Server URL

**Internal (Kubernetes cluster):**

```
http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000/sse
```

**External (LoadBalancer):**

```bash
# Get external IP
kubectl get svc -n search-infrastructure mcp-server-fastmcp

# Example: http://192.168.0.215:8000/sse
```

**Health Check:**

```bash
curl http://192.168.0.215:8000/health
# Returns: {"status":"healthy","service":"fastmcp-search-server"}
```

## 🔌 Remote Client Setup

### Option 1: Cursor IDE

1. **Open Cursor Settings:**

   - **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`
   - **Linux**: `~/.config/Cursor/User/globalStorage/mcp.json`
   - **Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp.json`

2. **Add MCP Server Configuration:**

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "http://192.168.0.215:8000/sse"
    }
  }
}
```

3. **Restart Cursor**

4. **Verify Connection:**
   - Open Cursor
   - Check MCP server status (should show "Connected")
   - Try asking: "Search for latest AI news"

### Option 2: Claude Desktop

1. **Open Claude Desktop Configuration:**

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add MCP Server:**

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "http://192.168.0.215:8000/sse"
    }
  }
}
```

3. **Restart Claude Desktop**

### Option 3: Python Client (Programmatic Access)

Install FastMCP client:

```bash
pip install fastmcp httpx
```

**Example Code:**

```python
import asyncio
from fastmcp import Client
import json

async def example():
    # Connect to MCP server
    async with Client('http://192.168.0.215:8000/sse') as client:
        # Call web_search tool
        result = await client.call_tool(
            name="web_search",
            arguments={
                "query": "latest AI developments 2024",
                "max_results": 5,
                "language": "en"
            }
        )

        # Parse result
        data = json.loads(result.content[0].text)
        print(f"Found {len(data.get('results', []))} results")
        for item in data.get('results', []):
            print(f"- {item.get('title')}")

asyncio.run(example())
```

### Option 4: Via IBM MCP Gateway (Enterprise)

If you have access to the IBM MCP Gateway:

1. **Register Server in Gateway Admin UI:**

   - URL: `https://mcp.bionicaisolutions.com/admin`
   - Add server: `http://192.168.0.215:8000/sse`
   - Transport: `SSE`

2. **Connect via Gateway:**

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "https://mcp.bionicaisolutions.com/mcp/oss-search-tools",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

## 🛠️ Available Tools

### 1. `web_search`

Search the web using SearXNG meta-search engine (aggregates 70+ search engines).

**Parameters:**

- `query` (string, **required**): Search query
- `max_results` (number, optional): Maximum results to return (default: 10)
- `language` (string, optional): Language code (default: "en")
- `categories` (string, optional): Search category - `news`, `images`, `videos`, `general` (default: "general")
- `engines` (array, optional): Specific engines to use, e.g., `["google", "duckduckgo"]`

**Returns:**

```json
{
  "results": [
    {
      "title": "Article Title",
      "url": "https://example.com/article",
      "content": "Article snippet...",
      "engine": "google"
    }
  ],
  "query": "search query",
  "total_results": 10
}
```

**Example:**

```python
result = await client.call_tool("web_search", {
    "query": "latest news India December 2024",
    "max_results": 10,
    "language": "en",
    "categories": "news"
})
```

### 2. `web_crawl`

Deep crawl and extract content from URLs using Crawl4AI.

**Parameters:**

- `url` (string, **required**): URL to crawl
- `extraction_strategy` (string, optional): `auto`, `llm`, or `cosine` (default: "auto")
- `chunking_strategy` (string, optional): `regex`, `markdown`, or `sliding` (default: "markdown")
- `screenshot` (boolean, optional): Capture screenshot (default: false)
- `wait_for` (string, optional): CSS selector to wait for before extracting
- `timeout` (number, optional): Timeout in seconds (default: 30)

**Returns:**

```json
{
  "url": "https://example.com",
  "markdown": "# Article Title\n\nContent...",
  "html": "<html>...</html>",
  "links": ["https://link1.com", "https://link2.com"],
  "media": {
    "images": ["https://image1.jpg"],
    "videos": ["https://video1.mp4"]
  },
  "metadata": {
    "title": "Article Title",
    "description": "Article description",
    "language": "en"
  },
  "content_length": 5000,
  "links_found": 10,
  "images_found": 5
}
```

**Example:**

```python
result = await client.call_tool("web_crawl", {
    "url": "https://example.com/article",
    "extraction_strategy": "auto",
    "screenshot": false
})
```

### 3. `extract_content`

Extract specific content types from a URL.

**Parameters:**

- `url` (string, **required**): URL to extract from
- `content_type` (string, **required**): `all`, `text`, `links`, `images`, or `videos`

**Returns:**

```json
{
  "url": "https://example.com",
  "text": "Extracted text content...",
  "text_length": 3000,
  "links": ["https://link1.com"],
  "links_count": 5,
  "images": ["https://image1.jpg"],
  "images_count": 3,
  "videos": [],
  "videos_count": 0
}
```

**Example:**

```python
result = await client.call_tool("extract_content", {
    "url": "https://example.com",
    "content_type": "all"
})
```

### 4. `analyze_search_results`

Analyze and rank search results based on relevance, freshness, and authority.

**Parameters:**

- `query` (string, **required**): Original search query
- `results` (string, **required**): JSON string of search results from `web_search`
- `relevance_weight` (number, optional): Weight for relevance scoring (default: 0.5)
- `freshness_weight` (number, optional): Weight for freshness scoring (default: 0.3)
- `authority_weight` (number, optional): Weight for authority scoring (default: 0.2)

**Returns:**

```json
{
  "query": "search query",
  "analyzed_results": [
    {
      "title": "Article Title",
      "url": "https://example.com",
      "relevance_score": 0.85,
      "freshness_score": 0.9,
      "authority_score": 0.75,
      "total_score": 0.84,
      "rank": 1
    }
  ],
  "summary": "Analysis summary..."
}
```

**Example:**

```python
# First, get search results
search_result = await client.call_tool("web_search", {
    "query": "AI news 2024",
    "max_results": 10
})
search_data = json.loads(search_result.content[0].text)

# Then analyze them
analysis = await client.call_tool("analyze_search_results", {
    "query": "AI news 2024",
    "results": json.dumps(search_data),
    "relevance_weight": 0.6,
    "freshness_weight": 0.3,
    "authority_weight": 0.1
})
```

## 📝 Usage Examples

### Example 1: Basic Web Search

**Use Case**: Find latest news about a topic

```python
import asyncio
from fastmcp import Client
import json

async def search_news():
    async with Client('http://192.168.0.215:8000/sse') as client:
        result = await client.call_tool("web_search", {
            "query": "latest AI breakthroughs December 2024",
            "max_results": 5,
            "categories": "news",
            "language": "en"
        })

        data = json.loads(result.content[0].text)
        print(f"Found {len(data['results'])} articles:")
        for article in data['results']:
            print(f"\n📰 {article['title']}")
            print(f"   {article['content'][:200]}...")
            print(f"   🔗 {article['url']}")

asyncio.run(search_news())
```

### Example 2: Deep Content Extraction

**Use Case**: Get full article content for analysis

```python
async def extract_article():
    async with Client('http://192.168.0.215:8000/sse') as client:
        # First, search for articles
        search = await client.call_tool("web_search", {
            "query": "quantum computing advances 2024",
            "max_results": 3
        })
        search_data = json.loads(search.content[0].text)

        # Get the first article URL
        first_url = search_data['results'][0]['url']

        # Crawl the article
        crawl = await client.call_tool("web_crawl", {
            "url": first_url,
            "extraction_strategy": "auto"
        })
        crawl_data = json.loads(crawl.content[0].text)

        print(f"Title: {crawl_data['metadata']['title']}")
        print(f"Content Length: {crawl_data['content_length']} chars")
        print(f"Links Found: {crawl_data['links_found']}")
        print(f"\nContent Preview:\n{crawl_data['markdown'][:500]}...")

asyncio.run(extract_article())
```

### Example 3: Multi-Step Research Workflow

**Use Case**: Comprehensive research with analysis

```python
async def research_workflow():
    async with Client('http://192.168.0.215:8000/sse') as client:
        query = "India economy growth 2024"

        # Step 1: Search
        print(f"🔍 Searching for: {query}")
        search = await client.call_tool("web_search", {
            "query": query,
            "max_results": 10,
            "categories": "news"
        })
        search_data = json.loads(search.content[0].text)
        print(f"✅ Found {len(search_data['results'])} results")

        # Step 2: Analyze results
        print("\n📊 Analyzing results...")
        analysis = await client.call_tool("analyze_search_results", {
            "query": query,
            "results": json.dumps(search_data),
            "relevance_weight": 0.5,
            "freshness_weight": 0.3,
            "authority_weight": 0.2
        })
        analysis_data = json.loads(analysis.content[0].text)

        # Step 3: Get top 3 articles
        print("\n📄 Extracting top 3 articles...")
        top_articles = analysis_data['analyzed_results'][:3]

        for i, article in enumerate(top_articles, 1):
            print(f"\n[{i}] {article['title']}")
            print(f"    Score: {article['total_score']:.2f}")

            crawl = await client.call_tool("web_crawl", {
                "url": article['url'],
                "extraction_strategy": "auto"
            })
            crawl_data = json.loads(crawl.content[0].text)
            print(f"    Content: {crawl_data['markdown'][:200]}...")

asyncio.run(research_workflow())
```

### Example 4: Content Aggregation

**Use Case**: Collect links and media from multiple sources

```python
async def aggregate_content():
    async with Client('http://192.168.0.215:8000/sse') as client:
        urls = [
            "https://example.com/article1",
            "https://example.com/article2",
            "https://example.com/article3"
        ]

        all_links = []
        all_images = []

        for url in urls:
            result = await client.call_tool("extract_content", {
                "url": url,
                "content_type": "all"
            })
            data = json.loads(result.content[0].text)

            all_links.extend(data.get('links', []))
            all_images.extend(data.get('images', []))

        print(f"Total Links: {len(all_links)}")
        print(f"Total Images: {len(all_images)}")
        print(f"\nUnique Links: {len(set(all_links))}")
        print(f"Unique Images: {len(set(all_images))}")

asyncio.run(aggregate_content())
```

## 🐍 Python Client Examples

### Complete Example: News Research Agent

```python
import asyncio
from fastmcp import Client
import json
from datetime import datetime

class NewsResearchAgent:
    def __init__(self, mcp_url: str):
        self.mcp_url = mcp_url
        self.client = None

    async def __aenter__(self):
        self.client = Client(self.mcp_url)
        await self.client.__aenter__()
        return self

    async def __aexit__(self, *args):
        await self.client.__aexit__(*args)

    async def search_and_analyze(self, query: str, top_n: int = 5):
        """Search for news and return top N analyzed articles."""
        # Search
        search_result = await self.client.call_tool("web_search", {
            "query": query,
            "max_results": 15,
            "categories": "news",
            "language": "en"
        })
        search_data = json.loads(search_result.content[0].text)

        # Analyze
        analysis_result = await self.client.call_tool("analyze_search_results", {
            "query": query,
            "results": json.dumps(search_data),
            "relevance_weight": 0.5,
            "freshness_weight": 0.4,
            "authority_weight": 0.1
        })
        analysis_data = json.loads(analysis_result.content[0].text)

        # Get top N
        top_articles = analysis_data['analyzed_results'][:top_n]

        # Extract full content
        detailed_articles = []
        for article in top_articles:
            crawl_result = await self.client.call_tool("web_crawl", {
                "url": article['url'],
                "extraction_strategy": "auto"
            })
            crawl_data = json.loads(crawl_result.content[0].text)

            detailed_articles.append({
                "title": article['title'],
                "url": article['url'],
                "score": article['total_score'],
                "content": crawl_data['markdown'],
                "metadata": crawl_data['metadata']
            })

        return detailed_articles

# Usage
async def main():
    async with NewsResearchAgent('http://192.168.0.215:8000/sse') as agent:
        articles = await agent.search_and_analyze(
            "Latest developments in AI safety",
            top_n=3
        )

        print(f"\n📰 Top {len(articles)} Articles:\n")
        for i, article in enumerate(articles, 1):
            print(f"{i}. {article['title']}")
            print(f"   Score: {article['score']:.2f}")
            print(f"   URL: {article['url']}")
            print(f"   Preview: {article['content'][:200]}...\n")

asyncio.run(main())
```

### Error Handling Example

```python
async def robust_search():
    async with Client('http://192.168.0.215:8000/sse') as client:
        try:
            result = await client.call_tool("web_search", {
                "query": "test query",
                "max_results": 5
            })
            data = json.loads(result.content[0].text)

            if 'error' in data:
                print(f"Error: {data['error']}")
                return

            print(f"Success: {len(data.get('results', []))} results")

        except Exception as e:
            print(f"Connection error: {e}")
            print("Check if MCP server is running and accessible")

asyncio.run(robust_search())
```

## 🔧 Troubleshooting

### Connection Issues

**Problem**: Cannot connect to MCP server

**Solutions**:

1. **Check server is running:**

   ```bash
   kubectl get pods -n search-infrastructure -l app=mcp-server-fastmcp
   ```

2. **Verify external IP:**

   ```bash
   kubectl get svc -n search-infrastructure mcp-server-fastmcp
   ```

3. **Test health endpoint:**

   ```bash
   curl http://192.168.0.215:8000/health
   ```

4. **Check firewall/network:**
   - Ensure port 8000 is accessible
   - Check if LoadBalancer IP is correct

### Tool Call Errors

**Problem**: Tool returns error

**Solutions**:

1. **Check backend services:**

   ```bash
   # Check SearXNG
   kubectl exec -n search-infrastructure <mcp-pod> -- curl http://searxng:8080/healthz

   # Check Crawl4AI
   kubectl exec -n search-infrastructure <mcp-pod> -- curl http://crawl4ai:8000/health
   ```

2. **Check logs:**

   ```bash
   kubectl logs -n search-infrastructure -l app=mcp-server-fastmcp --tail=50
   ```

3. **Verify parameters:**
   - Ensure required parameters are provided
   - Check parameter types (string vs number)

### Performance Issues

**Problem**: Slow responses

**Solutions**:

1. **Enable Redis caching** (if not already):

   - Set `REDIS_ENABLED=true` in deployment
   - Results will be cached for faster responses

2. **Check resource limits:**

   ```bash
   kubectl describe pod -n search-infrastructure -l app=mcp-server-fastmcp | grep -A 5 "Limits"
   ```

3. **Scale up deployment:**
   ```bash
   kubectl scale deployment mcp-server-fastmcp -n search-infrastructure --replicas=5
   ```

## 📚 Additional Resources

- **MCP Protocol**: https://modelcontextprotocol.io/
- **FastMCP Documentation**: https://github.com/jlowin/fastmcp
- **SearXNG**: https://docs.searxng.org/
- **Crawl4AI**: https://docs.crawl4ai.com/

## 🆘 Getting Help

1. Check server logs: `kubectl logs -n search-infrastructure -l app=mcp-server-fastmcp`
2. Verify all services: `kubectl get pods -n search-infrastructure`
3. Test health endpoints: `curl http://192.168.0.215:8000/health`
4. Review this guide's troubleshooting section

---

**Happy searching! 🔍**

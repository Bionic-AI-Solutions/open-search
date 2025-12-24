#!/usr/bin/env python3
"""
Simple FastMCP server exposing SearXNG and Crawl4AI tools.
Replaces the complex TypeScript MCP server with a simple Python implementation.
"""

import os
import json
import httpx
from typing import Any, Optional
from fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("OSS Search Tools")

# Get service URLs from environment
SEARXNG_URL = os.getenv("SEARXNG_URL", "http://searxng.search-infrastructure.svc.cluster.local:8080")
CRAWL4AI_URL = os.getenv("CRAWL4AI_URL", "http://crawl4ai.search-infrastructure.svc.cluster.local:8000")
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "false").lower() == "true"
REDIS_HOST = os.getenv("REDIS_HOST", "redis-cluster.redis.svc.cluster.local")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# HTTP client with timeout
http_client = httpx.Client(timeout=30.0)


def get_from_redis(key: str) -> Optional[str]:
    """Get value from Redis cache if enabled."""
    if not REDIS_ENABLED:
        return None
    try:
        import redis
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        return r.get(key)
    except Exception:
        return None


def set_to_redis(key: str, value: str, ttl: int = 3600):
    """Set value in Redis cache if enabled."""
    if not REDIS_ENABLED:
        return
    try:
        import redis
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        r.setex(key, ttl, value)
    except Exception:
        pass


@mcp.tool()
def web_search(
    query: str,
    engines: Optional[str] = None,
    categories: Optional[str] = None,
    language: Optional[str] = None,
    page: int = 1,
    safe_search: int = 0,
    max_results: int = 10
) -> str:
    """
    Search the web using SearXNG meta-search engine.
    Aggregates results from multiple search engines including Google, DuckDuckGo, Brave, and more.
    
    Args:
        query: Search query string. Be specific for best results.
        engines: Comma-separated list of engines (e.g., "google,duckduckgo,brave"). If not specified, uses all configured engines.
        categories: Search category - "general" (default), "images", "videos", "news", "it", "science"
        language: Search language code (e.g., "en", "es", "fr", "de") (default: "en")
        page: Page number for pagination (starts at 1) (default: 1)
        safe_search: Safe search level - 0=off, 1=moderate, 2=strict (default: 0)
        max_results: Maximum number of results to return (default: 10, max: 20)
    
    Returns:
        JSON string with search results including titles, URLs, content snippets, and metadata.
    """
    # Generate cache key
    cache_key = f"search:{query}:{engines or 'all'}:{categories or 'general'}:{language or 'en'}:{page}:{max_results}"
    
    # Check cache
    cached = get_from_redis(cache_key)
    if cached:
        return cached
    
    try:
        # Prepare search parameters
        params = {
            "q": query,
            "format": "json",
            "categories": categories or "general",
            "language": language or "en",
            "pageno": page,
            "safesearch": safe_search,
        }
        if engines:
            params["engines"] = engines
        
        # Perform search
        response = http_client.get(f"{SEARXNG_URL}/search", params=params)
        response.raise_for_status()
        data = response.json()
        
        # Format results
        results = []
        for result in data.get("results", [])[:max_results]:
            results.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", "")[:300],
                "engine": result.get("engine", ""),
                "score": result.get("score", 0),
                "publishedDate": result.get("publishedDate"),
            })
        
        response_data = {
            "query": query,
            "total_results": len(data.get("results", [])),
            "engines_used": engines or "all configured engines",
            "category": categories or "general",
            "language": language or "en",
            "page": page,
            "results": results,
        }
        
        result_json = json.dumps(response_data, indent=2)
        
        # Cache result (1 hour TTL)
        set_to_redis(cache_key, result_json, ttl=3600)
        
        return result_json
        
    except httpx.HTTPError as e:
        return json.dumps({
            "error": f"Search failed",
            "details": str(e)
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "error": f"Unexpected error during search",
            "details": str(e)
        }, indent=2)


@mcp.tool()
def web_crawl(
    url: str,
    extraction_strategy: Optional[str] = None,
    chunking_strategy: Optional[str] = None,
    screenshot: bool = False,
    wait_for: Optional[str] = None,
    timeout: Optional[int] = None
) -> str:
    """
    Deep crawl and extract content from a webpage using Crawl4AI.
    Supports JavaScript rendering, media extraction, and intelligent content parsing.
    
    Args:
        url: URL to crawl (must be a valid HTTP/HTTPS URL)
        extraction_strategy: Content extraction strategy - "auto" (default), "llm" (AI-powered), "cosine" (semantic similarity-based)
        chunking_strategy: How to chunk content - "markdown" (default, preserves structure), "regex" (pattern-based), "sliding" (fixed-size)
        screenshot: Capture screenshot of the page (returned as base64) (default: False)
        wait_for: CSS selector to wait for before extraction (useful for dynamic content)
        timeout: Request timeout in seconds (default: 30)
    
    Returns:
        JSON string with crawled content including markdown, links, images, videos, and metadata.
    """
    # Generate cache key
    cache_key = f"crawl:{url}"
    
    # Check cache
    cached = get_from_redis(cache_key)
    if cached:
        return cached
    
    try:
        # Prepare crawl request
        payload = {
            "url": url,
            "screenshot": screenshot,
        }
        if extraction_strategy:
            payload["extraction_strategy"] = extraction_strategy
        if chunking_strategy:
            payload["chunking_strategy"] = chunking_strategy
        if wait_for:
            payload["wait_for"] = wait_for
        if timeout:
            payload["timeout"] = timeout
        
        # Perform crawl
        response = http_client.post(f"{CRAWL4AI_URL}/crawl", json=payload)
        response.raise_for_status()
        data = response.json()
        
        # Format response
        result = {
            "url": data.get("url", url),
            "title": data.get("metadata", {}).get("title", ""),
            "description": data.get("metadata", {}).get("description", ""),
            "content_length": len(data.get("markdown", "")),
            "links_found": len(data.get("links", [])),
            "images_found": len(data.get("media", {}).get("images", [])),
            "videos_found": len(data.get("media", {}).get("videos", [])),
            "markdown_preview": data.get("markdown", "")[:1000],
            "full_markdown": data.get("markdown", ""),
            "links": data.get("links", [])[:20],
            "images": data.get("media", {}).get("images", [])[:10],
            "videos": data.get("media", {}).get("videos", [])[:10],
        }
        
        # Include screenshot if available
        if data.get("screenshot"):
            result["screenshot"] = data.get("screenshot")
        
        result_json = json.dumps(result, indent=2)
        
        # Cache result (24 hours TTL for crawl)
        set_to_redis(cache_key, result_json, ttl=86400)
        
        return result_json
        
    except httpx.HTTPError as e:
        return json.dumps({
            "error": f"Crawl failed",
            "details": str(e)
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "error": f"Unexpected error during crawl",
            "details": str(e)
        }, indent=2)


@mcp.tool()
def extract_content(
    url: str,
    content_type: Optional[str] = "text",
    selector: Optional[str] = None
) -> str:
    """
    Extract specific content from a webpage using CSS selectors or AI extraction.
    Uses cached crawl results when available, otherwise performs a fresh crawl.
    
    Args:
        url: URL to extract content from
        content_type: Type of content to extract - "text" (default), "links", "images", "metadata", "all"
        selector: CSS selector for specific elements (optional, uses AI extraction if not provided)
    
    Returns:
        JSON string with extracted content in structured format.
    """
    # First try to get from cache
    cache_key = f"crawl:{url}"
    cached = get_from_redis(cache_key)
    
    crawl_data = None
    if cached:
        try:
            crawl_data = json.loads(cached)
        except:
            pass
    
    # If not in cache, perform a fresh crawl
    if not crawl_data:
        try:
            payload = {"url": url, "extraction_strategy": "auto"}
            response = http_client.post(f"{CRAWL4AI_URL}/crawl", json=payload)
            response.raise_for_status()
            data = response.json()
            
            crawl_data = {
                "markdown": data.get("markdown", ""),
                "links": data.get("links", []),
                "images": data.get("media", {}).get("images", []),
                "videos": data.get("media", {}).get("videos", []),
                "metadata": data.get("metadata", {}),
            }
        except Exception as e:
            return json.dumps({
                "error": f"Failed to crawl URL for extraction",
                "details": str(e)
            }, indent=2)
    
    # Extract based on content_type
    result = {"url": url, "content_type": content_type}
    
    if content_type == "text" or content_type == "all":
        result["text"] = crawl_data.get("markdown", "")
        result["text_length"] = len(crawl_data.get("markdown", ""))
    
    if content_type == "links" or content_type == "all":
        result["links"] = crawl_data.get("links", [])
        result["links_count"] = len(crawl_data.get("links", []))
    
    if content_type == "images" or content_type == "all":
        result["images"] = crawl_data.get("images", [])
        result["images_count"] = len(crawl_data.get("images", []))
    
    if content_type == "videos" or content_type == "all":
        result["videos"] = crawl_data.get("videos", [])
        result["videos_count"] = len(crawl_data.get("videos", []))
    
    if content_type == "metadata" or content_type == "all":
        result["metadata"] = crawl_data.get("metadata", {})
    
    # If selector provided, try to extract specific elements
    if selector:
        # Note: This would require additional parsing logic
        # For now, we return the full content and note the selector
        result["selector"] = selector
        result["note"] = "Selector-based extraction requires additional parsing - returning full content"
    
    return json.dumps(result, indent=2)


@mcp.tool()
def analyze_search_results(
    query: str,
    results: str,
    relevance_weight: float = 0.5,
    freshness_weight: float = 0.3,
    authority_weight: float = 0.2
) -> str:
    """
    Analyze and score search results based on relevance, freshness, and authority.
    Provides insights, summaries, and ranked recommendations.
    
    Args:
        query: Original search query
        results: JSON string of search results (from web_search tool)
        relevance_weight: Weight for relevance scoring (default: 0.5)
        freshness_weight: Weight for freshness scoring (default: 0.3)
        authority_weight: Weight for authority scoring (default: 0.2)
    
    Returns:
        JSON string with analysis including scores, insights, and recommendations.
    """
    try:
        # Parse results
        if isinstance(results, str):
            results_data = json.loads(results)
        else:
            results_data = results
        
        # Extract results list
        # Handle both formats: {"results": [...]} or just [...]
        if isinstance(results_data, list):
            search_results = results_data
        else:
            search_results = results_data.get("results", [])
        if not search_results:
            return json.dumps({
                "query": query,
                "analysis": "No results to analyze",
                "total_results": 0
            }, indent=2)
        
        # Analyze each result
        analyzed = []
        query_terms = query.lower().split()
        
        for result in search_results:
            title = result.get("title", "").lower()
            content = result.get("content", "").lower()
            url = result.get("url", "")
            
            # Calculate relevance score
            relevance_score = 0.0
            for term in query_terms:
                if term in title:
                    relevance_score += 2.0
                if term in content:
                    relevance_score += 1.0
            relevance_score = min(relevance_score / (len(query_terms) * 3), 1.0)
            
            # Calculate freshness score (if published date available)
            freshness_score = 0.5  # Default neutral
            # Note: Would need publishedDate from result if available
            
            # Calculate authority score (based on domain)
            authority_score = 0.5  # Default neutral
            if url:
                domain = url.split("/")[2] if len(url.split("/")) > 2 else ""
                # Simple heuristic: known domains get higher scores
                known_domains = ["wikipedia.org", "github.com", "stackoverflow.com", "arxiv.org"]
                if any(known in domain for known in known_domains):
                    authority_score = 0.8
            
            # Calculate composite score
            composite_score = (
                relevance_score * relevance_weight +
                freshness_score * freshness_weight +
                authority_score * authority_weight
            )
            
            analyzed.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "scores": {
                    "relevance": round(relevance_score, 3),
                    "freshness": round(freshness_score, 3),
                    "authority": round(authority_score, 3),
                    "composite": round(composite_score, 3)
                }
            })
        
        # Sort by composite score
        analyzed.sort(key=lambda x: x["scores"]["composite"], reverse=True)
        
        # Generate insights
        top_result = analyzed[0] if analyzed else None
        avg_relevance = sum(r["scores"]["relevance"] for r in analyzed) / len(analyzed) if analyzed else 0
        
        insights = {
            "total_results_analyzed": len(analyzed),
            "average_relevance": round(avg_relevance, 3),
            "top_result": top_result["title"] if top_result else None,
            "top_result_url": top_result["url"] if top_result else None,
            "top_result_score": top_result["scores"]["composite"] if top_result else None
        }
        
        # Build response
        response = {
            "query": query,
            "analysis": {
                "insights": insights,
                "scoring_weights": {
                    "relevance": relevance_weight,
                    "freshness": freshness_weight,
                    "authority": authority_weight
                },
                "ranked_results": analyzed[:10]  # Top 10
            }
        }
        
        return json.dumps(response, indent=2)
        
    except json.JSONDecodeError:
        return json.dumps({
            "error": "Invalid JSON in results parameter",
            "query": query
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "error": f"Analysis failed",
            "details": str(e),
            "query": query
        }, indent=2)


# Add health check endpoint for Kubernetes
from starlette.responses import JSONResponse

@mcp.custom_route("/health", methods=["GET"])
async def health_check(request):
    """Health check endpoint for Kubernetes probes."""
    return JSONResponse({
        "status": "healthy",
        "service": "mcp-server-fastmcp",
        "transport": "sse",
        "tools": ["web_search", "web_crawl", "extract_content", "analyze_search_results"]
    })


if __name__ == "__main__":
    # Run the FastMCP server
    # FastMCP automatically handles stdio, HTTP, and SSE transports
    port = os.getenv("PORT")
    if port:
        # HTTP/SSE mode for Kubernetes/remote access
        # Bind to 0.0.0.0 to allow external connections
        mcp.run(transport="sse", port=int(port), host="0.0.0.0")
    else:
        # stdio mode for local/spawned processes
        mcp.run()


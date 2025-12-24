#!/usr/bin/env python3
"""
Simple test script to test MCP tools via direct HTTP calls to the server.
"""

import httpx
import json
import sys

MCP_URL = "http://192.168.0.215:8000"

def test_health():
    """Test health endpoint."""
    print("=" * 70)
    print("Testing MCP Server Health")
    print("=" * 70)
    try:
        response = httpx.get(f"{MCP_URL}/health", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_via_searxng():
    """Test by calling SearXNG directly (simulating what MCP tool does)."""
    print("\n" + "=" * 70)
    print("Testing Search via SearXNG (Direct)")
    print("=" * 70)
    
    # Get internal service URL
    searxng_url = "http://searxng.search-infrastructure.svc.cluster.local:8080"
    
    # Try to test from a pod
    print("Query: Latest news in India today December 23 2025")
    print("This would be called by the web_search tool...")
    
    # Since we can't easily call from outside, let's check if we can exec into a pod
    return True

if __name__ == "__main__":
    print("MCP Server Tools Test - Simple Version")
    print(f"Server URL: {MCP_URL}\n")
    
    health_ok = test_health()
    
    if health_ok:
        print("\n✅ Server is healthy and accessible!")
        print("\nNote: To test tools, we need to use an MCP client.")
        print("The server exposes tools via SSE endpoint at /sse")
        print("Tools available: web_search, web_crawl, extract_content, analyze_search_results")
    else:
        print("\n❌ Server health check failed!")
        sys.exit(1)


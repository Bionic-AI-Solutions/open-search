#!/usr/bin/env python3
"""
Test script to verify MCP server tools with real queries.
Tests web_search tool with query: "Latest news in India today. Dec 23 2025"
"""

import asyncio
import json
from fastmcp import Client

# MCP Server endpoint
MCP_URL = "http://192.168.0.215:8000/sse"

async def test_mcp_tools():
    """Test MCP server tools with real queries."""
    print("=" * 70)
    print("MCP Server Tools Test")
    print("=" * 70)
    
    try:
        # Connect to MCP server
        print(f"\n[1] Connecting to MCP server: {MCP_URL}")
        async with Client(MCP_URL) as client:
            print("✅ Connected successfully!")
            
            # List available tools
            print("\n[2] Listing available tools...")
            tools = await client.list_tools()
            print(f"✅ Found {len(tools)} tools:")
            for tool in tools:
                print(f"   - {tool.name}: {tool.description[:80]}...")
            
            # Test web_search tool
            print("\n[3] Testing web_search tool...")
            print("   Query: 'Latest news in India today. Dec 23 2025'")
            print("   Parameters:")
            print("     - engines: google,duckduckgo")
            print("     - language: en")
            print("     - max_results: 10")
            print("     - categories: news")
            
            search_result = await client.call_tool(
                "web_search",
                {
                    "query": "Latest news in India today December 23 2025",
                    "engines": "google,duckduckgo",
                    "language": "en",
                    "categories": "news",
                    "max_results": 10,
                    "page": 1
                }
            )
            
            print("\n✅ Search completed!")
            print("\n[4] Search Results:")
            print("-" * 70)
            
            # Parse and display results
            if hasattr(search_result, 'content') and search_result.content:
                result_text = search_result.content[0].text if hasattr(search_result.content[0], 'text') else str(search_result.content[0])
            else:
                result_text = str(search_result)
            
            try:
                result_data = json.loads(result_text)
                print(f"\n📊 Summary:")
                print(f"   - Query: {result_data.get('query', 'N/A')}")
                print(f"   - Total Results: {len(result_data.get('results', []))}")
                print(f"   - Engines Used: {', '.join(result_data.get('engines_used', []))}")
                
                print(f"\n📰 Top News Results:")
                for i, result in enumerate(result_data.get('results', [])[:5], 1):
                    print(f"\n   [{i}] {result.get('title', 'No title')}")
                    print(f"       URL: {result.get('url', 'N/A')}")
                    print(f"       Content: {result.get('content', '')[:150]}...")
                    if result.get('publishedDate'):
                        print(f"       Published: {result.get('publishedDate')}")
                
                # Save full results to file
                with open('/workspace/mcp_test_results.json', 'w') as f:
                    json.dump(result_data, f, indent=2)
                print(f"\n💾 Full results saved to: /workspace/mcp_test_results.json")
                
            except json.JSONDecodeError:
                print("Raw result (not JSON):")
                print(result_text[:500])
            
            print("\n" + "=" * 70)
            print("✅ Test completed successfully!")
            print("=" * 70)
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = asyncio.run(test_mcp_tools())
    exit(0 if success else 1)


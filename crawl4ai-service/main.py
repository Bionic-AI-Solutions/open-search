"""
Crawl4AI Service - FastAPI Wrapper for Web Crawling
Provides RESTful API for the Crawl4AI library
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl, Field, field_validator
from typing import Optional, List, Dict, Any
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.extraction_strategy import LLMExtractionStrategy, CosineStrategy
from crawl4ai.chunking_strategy import RegexChunking, SlidingWindowChunking
# MarkdownChunking removed in newer versions - use RegexChunking for markdown
import redis.asyncio as redis
import hashlib
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Crawl4AI Service",
    description="Web crawling and content extraction service",
    version="1.0.0"
)

# Redis connection
redis_client: Optional[redis.Redis] = None

# Pydantic models
class CrawlRequest(BaseModel):
    url: HttpUrl
    extraction_strategy: str = Field(default="auto", pattern="^(auto|llm|cosine)$")
    chunking_strategy: str = Field(default="markdown", pattern="^(regex|markdown|sliding)$")
    screenshot: bool = False
    wait_for: Optional[str] = None
    timeout: int = Field(default=30, ge=5, le=120)
    js_code: Optional[str] = None
    css_selector: Optional[str] = None
    word_count_threshold: int = Field(default=10, ge=1)

class BatchCrawlRequest(BaseModel):
    urls: List[HttpUrl]
    extraction_strategy: str = Field(default="auto", pattern="^(auto|llm|cosine)$")
    chunking_strategy: str = Field(default="markdown", pattern="^(regex|markdown|sliding)$")
    screenshot: bool = False
    timeout: int = Field(default=30, ge=5, le=120)

class CrawlResponse(BaseModel):
    url: str
    markdown: str
    html: str
    links: List[str]
    media: Dict[str, List[str]]
    metadata: Dict[str, Any]
    screenshot: Optional[str] = None
    timestamp: str
    
    @field_validator('links', mode='before')
    @classmethod
    def convert_links_to_strings(cls, v):
        """Convert links from dicts to strings - handles both new and cached data"""
        if v is None:
            return []
        if not isinstance(v, (list, tuple)):
            return []
        converted = []
        for link in v:
            if isinstance(link, dict):
                # Extract URL from dict (Crawl4AI returns links as dicts with 'href' key)
                url = link.get("href") or link.get("url") or link.get("link") or link.get("src")
                if url:
                    converted.append(str(url))
                else:
                    # Fallback: convert entire dict to string
                    converted.append(str(link))
            elif isinstance(link, str):
                converted.append(link)
            else:
                # Convert anything else to string
                converted.append(str(link))
        return converted

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    redis_connected: bool

# Startup/Shutdown
@app.on_event("startup")
async def startup_event():
    global redis_client
    try:
        import os
        redis_host = os.getenv("REDIS_HOST", "redis")
        redis_port = os.getenv("REDIS_PORT", "6379")
        redis_password = os.getenv("REDIS_PASSWORD", "")
        # OSS Redis Cluster doesn't use password - only use password if explicitly set and not empty
        if redis_password and redis_password.strip():
            redis_url = f"redis://:{redis_password}@{redis_host}:{redis_port}"
        else:
            redis_url = f"redis://{redis_host}:{redis_port}"
        redis_client = await redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        await redis_client.ping()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        redis_client = None

@app.on_event("shutdown")
async def shutdown_event():
    if redis_client:
        await redis_client.close()

# Helper functions
def get_chunking_strategy(strategy_name: str):
    """Get chunking strategy based on name"""
    strategies = {
        "regex": RegexChunking(),
        "markdown": RegexChunking(),  # Use RegexChunking for markdown (MarkdownChunking removed)
        "sliding": SlidingWindowChunking()
    }
    return strategies.get(strategy_name, RegexChunking())

def get_extraction_strategy(strategy_name: str):
    """Get extraction strategy based on name"""
    if strategy_name == "cosine":
        return CosineStrategy(
            semantic_filter="",
            word_count_threshold=10,
            max_dist=0.2,
            linkage_method="ward",
            top_k=3
        )
    # For 'auto' and 'llm', we'll use default extraction
    return None

async def get_cached_result(cache_key: str) -> Optional[Dict]:
    """Get cached crawl result"""
    if not redis_client:
        return None
    
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.error(f"Cache retrieval error: {e}")
    
    return None

async def set_cached_result(cache_key: str, result: Dict, ttl: int = 86400):
    """Cache crawl result"""
    if not redis_client:
        return
    
    try:
        await redis_client.setex(
            cache_key,
            ttl,
            json.dumps(result)
        )
    except Exception as e:
        logger.error(f"Cache storage error: {e}")

def generate_cache_key(url: str, params: Dict) -> str:
    """Generate cache key for crawl request"""
    key_data = f"{url}:{json.dumps(params, sort_keys=True)}"
    return f"crawl:{hashlib.md5(key_data.encode()).hexdigest()}"

async def perform_crawl(request: CrawlRequest) -> CrawlResponse:
    """Perform web crawl with specified parameters"""
    
    # Generate cache key
    cache_params = {
        "extraction": request.extraction_strategy,
        "chunking": request.chunking_strategy,
        "screenshot": request.screenshot
    }
    cache_key = generate_cache_key(str(request.url), cache_params)
    
    # Check cache
    cached_result = await get_cached_result(cache_key)
    if cached_result:
        logger.info(f"Cache hit for {request.url}")
        # CRITICAL: Ensure cached links are strings (backward compatibility)
        if "links" in cached_result and cached_result["links"]:
            cached_links = []
            for link in cached_result["links"]:
                if isinstance(link, dict):
                    url = link.get("href") or link.get("url") or link.get("link") or link.get("src")
                    cached_links.append(str(url) if url else str(link))
                else:
                    cached_links.append(str(link))
            cached_result["links"] = [str(l) for l in cached_links]  # Final safety pass
        return CrawlResponse(**cached_result)
    
    # Perform crawl
    try:
        # Configure browser
        browser_config = BrowserConfig(
            headless=True,
            verbose=True
        )
        
        # Configure chunking strategy
        chunking_strategy = get_chunking_strategy(request.chunking_strategy)
        
        # Configure extraction strategy
        extraction_strategy = get_extraction_strategy(request.extraction_strategy)
        
        # Create crawler run config
        # Based on Crawl4AI self-hosting best practices: https://docs.crawl4ai.com/core/self-hosting/
        run_config = CrawlerRunConfig(
            word_count_threshold=request.word_count_threshold,
            cache_mode=CacheMode.BYPASS,  # We handle caching ourselves via Redis
            chunking_strategy=chunking_strategy,
            extraction_strategy=extraction_strategy,
            screenshot=request.screenshot,
            wait_for=request.wait_for,
            js_code=request.js_code,
            css_selector=request.css_selector,
            page_timeout=request.timeout * 1000 if request.timeout else 30000,  # Convert to milliseconds
            verbose=True,
            # Additional options from self-hosting best practices
            remove_overlay_elements=True  # Remove popups/overlays for cleaner content
            # Note: cache_mode=CacheMode.BYPASS already set above (we handle caching via Redis)
        )
        
        # Execute crawl with proper configuration
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=str(request.url), config=run_config)
            
            # Process result
            if not result.success:
                raise HTTPException(
                    status_code=500,
                    detail=f"Crawl failed: {result.error_message}"
                )
            
            # Extract data
            # Handle markdown - it might be an object with raw_markdown and fit_markdown
            if hasattr(result.markdown, 'raw_markdown'):
                markdown_content = result.markdown.raw_markdown or result.markdown.fit_markdown or ""
            elif isinstance(result.markdown, str):
                markdown_content = result.markdown
            else:
                markdown_content = str(result.markdown) if result.markdown else ""
            
            # Handle HTML - prefer cleaned_html if available
            html_content = result.cleaned_html if hasattr(result, 'cleaned_html') and result.cleaned_html else (result.html or "")
            
            # Convert links to strings if they're dicts
            links_dict = result.links if isinstance(result.links, dict) else {}
            internal_links = links_dict.get("internal", []) or []
            external_links = links_dict.get("external", []) or []
            all_links = []
            
            # Process all links - extract href from dicts
            for link in list(internal_links) + list(external_links):
                if isinstance(link, dict):
                    # Try multiple possible keys for the URL
                    url = link.get("href") or link.get("url") or link.get("link") or link.get("src")
                    if url:
                        all_links.append(str(url))
                    else:
                        # Fallback: convert entire dict to string representation
                        all_links.append(str(link))
                elif isinstance(link, str):
                    all_links.append(link)
                else:
                    # Convert anything else to string
                    all_links.append(str(link))
            
            # Convert media to strings as well
            media_dict = result.media if isinstance(result.media, dict) else {}
            images = media_dict.get("images", [])
            videos = media_dict.get("videos", [])
            image_urls = []
            video_urls = []
            
            for img in images:
                if isinstance(img, dict):
                    image_urls.append(img.get("src", img.get("url", str(img))))
                else:
                    image_urls.append(str(img))
            
            for vid in videos:
                if isinstance(vid, dict):
                    video_urls.append(vid.get("src", vid.get("url", str(vid))))
                else:
                    video_urls.append(str(vid))
            
            # Get metadata
            metadata_dict = result.metadata if isinstance(result.metadata, dict) else {}
            
            # Debug: Verify links are strings
            logger.info(f"Links before validation: {all_links[:3] if all_links else []}")
            logger.info(f"Link types: {[type(l).__name__ for l in all_links[:3]] if all_links else []}")
            
            # CRITICAL: Final conversion - ensure ALL links are strings before creating response_data
            # This must happen BEFORE response_data is created to avoid Pydantic validation errors
            final_links_list = []
            for item in all_links:
                if isinstance(item, dict):
                    url = item.get("href") or item.get("url") or item.get("link") or item.get("src")
                    final_links_list.append(str(url) if url else str(item))
                else:
                    final_links_list.append(str(item))
            
            # One more safety pass - force everything to string
            final_links_list = [str(l) for l in final_links_list]
            
            logger.info(f"Final links count: {len(final_links_list)}, all strings: {all(isinstance(l, str) for l in final_links_list)}")
            
            response_data = {
                "url": str(request.url),
                "markdown": markdown_content,
                "html": html_content,
                "links": final_links_list,  # Use final_links_list which is guaranteed to be strings
                "media": {
                    "images": image_urls,
                    "videos": video_urls
                },
                "metadata": {
                    "title": metadata_dict.get("title", ""),
                    "description": metadata_dict.get("description", ""),
                    "keywords": metadata_dict.get("keywords", []),
                    "language": metadata_dict.get("language", ""),
                },
                "screenshot": result.screenshot if request.screenshot and hasattr(result, 'screenshot') else None,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Cache result
            await set_cached_result(cache_key, response_data)
            
            return CrawlResponse(**response_data)
            
    except Exception as e:
        logger.error(f"Crawl error for {request.url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# API Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    redis_ok = False
    if redis_client:
        try:
            await redis_client.ping()
            redis_ok = True
        except:
            pass
    
    return HealthResponse(
        status="healthy" if redis_ok else "degraded",
        timestamp=datetime.utcnow().isoformat(),
        redis_connected=redis_ok
    )

@app.post("/crawl", response_model=CrawlResponse)
async def crawl_url(request: CrawlRequest):
    """
    Crawl a single URL and extract content
    
    - **url**: The URL to crawl
    - **extraction_strategy**: Content extraction method (auto, llm, cosine)
    - **chunking_strategy**: How to chunk content (regex, markdown, sliding)
    - **screenshot**: Whether to capture screenshot
    - **wait_for**: CSS selector to wait for before extraction
    - **timeout**: Request timeout in seconds
    """
    logger.info(f"Crawling URL: {request.url}")
    return await perform_crawl(request)

@app.post("/crawl/batch")
async def batch_crawl(request: BatchCrawlRequest, background_tasks: BackgroundTasks):
    """
    Crawl multiple URLs in batch
    
    Returns immediately with job IDs. Results are cached and can be retrieved later.
    """
    if len(request.urls) > 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum 50 URLs allowed per batch"
        )
    
    job_ids = []
    
    for url in request.urls:
        # Create individual crawl request
        crawl_req = CrawlRequest(
            url=url,
            extraction_strategy=request.extraction_strategy,
            chunking_strategy=request.chunking_strategy,
            screenshot=request.screenshot,
            timeout=request.timeout
        )
        
        # Generate job ID (cache key)
        cache_params = {
            "extraction": request.extraction_strategy,
            "chunking": request.chunking_strategy,
            "screenshot": request.screenshot
        }
        job_id = generate_cache_key(str(url), cache_params)
        job_ids.append({"url": str(url), "job_id": job_id})
        
        # Add to background tasks
        background_tasks.add_task(perform_crawl, crawl_req)
    
    return {
        "status": "processing",
        "total_urls": len(request.urls),
        "jobs": job_ids,
        "message": "Batch crawl initiated. Use job_id to retrieve results from cache."
    }

@app.get("/result/{job_id}")
async def get_result(job_id: str):
    """
    Retrieve crawl result by job ID (cache key)
    """
    result = await get_cached_result(f"crawl:{job_id}")
    
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Result not found or expired"
        )
    
    return result

@app.delete("/cache/{job_id}")
async def clear_cache(job_id: str):
    """
    Clear cached result by job ID
    """
    if not redis_client:
        raise HTTPException(
            status_code=503,
            detail="Cache service unavailable"
        )
    
    try:
        deleted = await redis_client.delete(f"crawl:{job_id}")
        return {
            "status": "success" if deleted else "not_found",
            "job_id": job_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """API information"""
    return {
        "name": "Crawl4AI Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "crawl": "/crawl",
            "batch_crawl": "/crawl/batch",
            "get_result": "/result/{job_id}",
            "clear_cache": "/cache/{job_id}"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )

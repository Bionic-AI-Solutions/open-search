"""
Crawl4AI Service - FastAPI Wrapper for Web Crawling
Provides RESTful API for the Crawl4AI library
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl, Field
from typing import Optional, List, Dict, Any
import asyncio
from crawl4ai import AsyncWebCrawler, CacheMode
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
        redis_url = f"redis://:{redis_password}@{redis_host}:{redis_port}" if redis_password else f"redis://{redis_host}:{redis_port}"
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
        return CrawlResponse(**cached_result)
    
    # Perform crawl
    try:
        async with AsyncWebCrawler(verbose=True) as crawler:
            # Prepare crawl parameters
            crawl_params = {
                "url": str(request.url),
                "word_count_threshold": request.word_count_threshold,
                "bypass_cache": True,
                "screenshot": request.screenshot
            }
            
            # Add chunking strategy
            chunking_strategy = get_chunking_strategy(request.chunking_strategy)
            crawl_params["chunking_strategy"] = chunking_strategy
            
            # Add extraction strategy if specified
            extraction_strategy = get_extraction_strategy(request.extraction_strategy)
            if extraction_strategy:
                crawl_params["extraction_strategy"] = extraction_strategy
            
            # Add optional parameters
            if request.wait_for:
                crawl_params["wait_for"] = request.wait_for
            
            if request.js_code:
                crawl_params["js_code"] = request.js_code
            
            if request.css_selector:
                crawl_params["css_selector"] = request.css_selector
            
            # Execute crawl
            result = await crawler.arun(**crawl_params)
            
            # Process result
            if not result.success:
                raise HTTPException(
                    status_code=500,
                    detail=f"Crawl failed: {result.error_message}"
                )
            
            # Extract data
            response_data = {
                "url": str(request.url),
                "markdown": result.markdown or "",
                "html": result.html or "",
                "links": result.links.get("internal", []) + result.links.get("external", []),
                "media": {
                    "images": result.media.get("images", []),
                    "videos": result.media.get("videos", [])
                },
                "metadata": {
                    "title": result.metadata.get("title", ""),
                    "description": result.metadata.get("description", ""),
                    "keywords": result.metadata.get("keywords", []),
                    "language": result.metadata.get("language", ""),
                },
                "screenshot": result.screenshot if request.screenshot else None,
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

# OSS Search Infrastructure Architecture & Implementation Plan

## Executive Summary

This document provides a complete architecture and implementation plan for replacing commercial search APIs (Tavily, Brave Search, Serper) with an open-source stack deployable on Kubernetes/Docker and exposed via MCP (Model Context Protocol) server.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Details](#component-details)
3. [Infrastructure Setup](#infrastructure-setup)
4. [MCP Server Implementation](#mcp-server-implementation)
5. [Deployment Configurations](#deployment-configurations)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Monitoring & Scaling](#monitoring--scaling)

---

## Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Applications                       │
│                    (AI Agents, LLM Clients)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ MCP Protocol
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Server                              │
│                    (FastMCP or TypeScript)                      │
│  ┌──────────────┬──────────────┬──────────────────────────┐   │
│  │ Search Tool  │ Crawl Tool   │ Content Extract Tool     │   │
│  └──────────────┴──────────────┴──────────────────────────┘   │
└──────┬──────────────────┬────────────────────────────┬─────────┘
       │                  │                            │
       ▼                  ▼                            ▼
┌─────────────┐    ┌─────────────┐           ┌─────────────────┐
│  SearXNG    │    │  Crawl4AI   │           │  Redis Cache    │
│ Meta-Search │    │   Service   │           │  (Optional)     │
│   Engine    │    │             │           │                 │
└──────┬──────┘    └──────┬──────┘           └─────────────────┘
       │                  │
       │                  ├──────────────────────────┐
       │                  │                          │
       ▼                  ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              External Search Engines & Web Content              │
│   (Google, Bing, DuckDuckGo, Brave, etc.)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Stack

| Component | Purpose | Technology |
|-----------|---------|------------|
| **SearXNG** | Meta-search aggregation | Python, Flask |
| **Crawl4AI** | Deep web crawling & extraction | Python, Playwright |
| **Redis** | Caching & rate limiting | Redis 7+ |
| **MCP Server** | API exposure to AI agents | TypeScript/FastMCP |
| **Nginx** | Load balancing & ingress | Nginx |
| **PostgreSQL** | Optional search history/analytics | PostgreSQL 15+ |

---

## Component Details

### 1. SearXNG (Meta-Search Engine)

**Purpose:** Aggregates results from multiple search engines without tracking.

**Features:**
- 70+ supported search engines
- No user tracking or profiling
- Customizable result ranking
- JSON API support
- Rate limiting & caching
- Docker-ready

**API Endpoints:**
- `GET /search?q={query}&format=json&categories=general`
- `GET /search?q={query}&engines=google,duckduckgo&format=json`

**Configuration Highlights:**
```yaml
# SearXNG settings
general:
  instance_name: "Private Search"
  
search:
  safe_search: 0
  autocomplete: "google"
  default_lang: "en"
  
server:
  secret_key: "CHANGE_THIS_SECRET"
  limiter: true
  image_proxy: true
  
engines:
  - name: google
    engine: google
    shortcut: go
    weight: 1
  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg
    weight: 0.8
  - name: brave
    engine: brave
    shortcut: br
    weight: 0.9
```

### 2. Crawl4AI

**Purpose:** Advanced web crawling and content extraction with AI-powered features.

**Features:**
- Async crawling with Playwright
- JavaScript rendering
- LLM-ready markdown extraction
- Media extraction (images, videos)
- Link extraction and analysis
- Custom extraction strategies
- Proxy support

**Key Capabilities:**
- Smart content extraction
- Multiple chunking strategies
- Screenshot capture
- PDF generation
- Cookie/session management

**API Interface (Custom Wrapper):**
```python
# Endpoints we'll expose
POST /crawl
  {
    "url": "https://example.com",
    "extraction_strategy": "auto|llm|cosine",
    "chunking_strategy": "regex|markdown|sliding",
    "screenshot": false,
    "wait_for": "css:.content"
  }

POST /crawl/batch
  {
    "urls": ["url1", "url2", ...],
    "extraction_config": {...}
  }
```

### 3. Redis Cache Layer

**Purpose:** Performance optimization and rate limiting.

**Use Cases:**
- Cache search results (TTL: 1-24 hours)
- Rate limiting per client
- Session management
- Distributed locks for crawling

**Schema Design:**
```
search:{query_hash} → JSON (search results)
crawl:{url_hash} → JSON (crawled content)
ratelimit:{client_id}:{endpoint} → counter
```

### 4. PostgreSQL (Optional - Analytics)

**Purpose:** Store search history and analytics.

**Schema:**
```sql
CREATE TABLE search_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    engine TEXT,
    results_count INTEGER,
    response_time_ms INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE crawl_jobs (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT,
    content_hash TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
```

---

## Infrastructure Setup

### Docker Compose Setup (Development)

**File: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  # SearXNG Meta-Search Engine
  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    ports:
      - "8080:8080"
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
      - ./searxng/limiter.toml:/etc/searxng/limiter.toml:ro
    environment:
      - SEARXNG_SECRET=${SEARXNG_SECRET:-changeme}
      - BIND_ADDRESS=0.0.0.0:8080
    restart: unless-stopped
    networks:
      - search-network

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: redis-cache
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    networks:
      - search-network

  # Crawl4AI Service
  crawl4ai:
    build:
      context: ./crawl4ai-service
      dockerfile: Dockerfile
    container_name: crawl4ai-service
    ports:
      - "8000:8000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    volumes:
      - playwright-cache:/ms-playwright
    restart: unless-stopped
    networks:
      - search-network
    depends_on:
      - redis

  # MCP Server
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: mcp-search-server
    ports:
      - "3000:3000"
    environment:
      - SEARXNG_URL=http://searxng:8080
      - CRAWL4AI_URL=http://crawl4ai:8000
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    restart: unless-stopped
    networks:
      - search-network
    depends_on:
      - searxng
      - crawl4ai
      - redis

  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    container_name: nginx-lb
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    restart: unless-stopped
    networks:
      - search-network
    depends_on:
      - mcp-server

  # PostgreSQL (Optional - Analytics)
  postgres:
    image: postgres:15-alpine
    container_name: search-analytics
    environment:
      - POSTGRES_DB=search_analytics
      - POSTGRES_USER=searchuser
      - POSTGRES_PASSWORD=${DB_PASSWORD:-changeme}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - search-network

networks:
  search-network:
    driver: bridge

volumes:
  redis-data:
  postgres-data:
  playwright-cache:
```

### Kubernetes Deployment

**Directory Structure:**
```
k8s/
├── namespace.yaml
├── configmaps/
│   ├── searxng-config.yaml
│   └── nginx-config.yaml
├── secrets/
│   └── secrets.yaml
├── deployments/
│   ├── searxng-deployment.yaml
│   ├── crawl4ai-deployment.yaml
│   ├── mcp-server-deployment.yaml
│   └── redis-deployment.yaml
├── services/
│   ├── searxng-service.yaml
│   ├── crawl4ai-service.yaml
│   ├── mcp-server-service.yaml
│   └── redis-service.yaml
├── ingress/
│   └── ingress.yaml
└── storage/
    ├── redis-pvc.yaml
    └── postgres-pvc.yaml
```

**Key Files:**

**1. Namespace:**
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: search-infrastructure
  labels:
    name: search-infrastructure
```

**2. SearXNG Deployment:**
```yaml
# k8s/deployments/searxng-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: searxng
  namespace: search-infrastructure
spec:
  replicas: 3
  selector:
    matchLabels:
      app: searxng
  template:
    metadata:
      labels:
        app: searxng
    spec:
      containers:
      - name: searxng
        image: searxng/searxng:latest
        ports:
        - containerPort: 8080
        env:
        - name: SEARXNG_SECRET
          valueFrom:
            secretKeyRef:
              name: search-secrets
              key: searxng-secret
        - name: BIND_ADDRESS
          value: "0.0.0.0:8080"
        volumeMounts:
        - name: config
          mountPath: /etc/searxng/settings.yml
          subPath: settings.yml
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: searxng-config
---
apiVersion: v1
kind: Service
metadata:
  name: searxng
  namespace: search-infrastructure
spec:
  selector:
    app: searxng
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP
```

**3. Crawl4AI Deployment:**
```yaml
# k8s/deployments/crawl4ai-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crawl4ai
  namespace: search-infrastructure
spec:
  replicas: 2
  selector:
    matchLabels:
      app: crawl4ai
  template:
    metadata:
      labels:
        app: crawl4ai
    spec:
      initContainers:
      - name: install-playwright
        image: mcr.microsoft.com/playwright/python:v1.40.0-jammy
        command: ['sh', '-c', 'playwright install chromium']
        volumeMounts:
        - name: playwright-cache
          mountPath: /ms-playwright
      containers:
      - name: crawl4ai
        image: your-registry/crawl4ai-service:latest
        ports:
        - containerPort: 8000
        env:
        - name: REDIS_HOST
          value: "redis"
        - name: REDIS_PORT
          value: "6379"
        - name: PLAYWRIGHT_BROWSERS_PATH
          value: "/ms-playwright"
        volumeMounts:
        - name: playwright-cache
          mountPath: /ms-playwright
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
      volumes:
      - name: playwright-cache
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: crawl4ai
  namespace: search-infrastructure
spec:
  selector:
    app: crawl4ai
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

**4. MCP Server Deployment:**
```yaml
# k8s/deployments/mcp-server-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
  namespace: search-infrastructure
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
      - name: mcp-server
        image: your-registry/mcp-search-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: SEARXNG_URL
          value: "http://searxng:8080"
        - name: CRAWL4AI_URL
          value: "http://crawl4ai:8000"
        - name: REDIS_URL
          value: "redis://redis:6379"
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-server
  namespace: search-infrastructure
spec:
  selector:
    app: mcp-server
  ports:
  - port: 3000
    targetPort: 3000
  type: LoadBalancer
```

**5. Redis Deployment:**
```yaml
# k8s/deployments/redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: search-infrastructure
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        command: ["redis-server", "--appendonly", "yes"]
        volumeMounts:
        - name: redis-storage
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: redis-storage
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: search-infrastructure
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
```

**6. Ingress Configuration:**
```yaml
# k8s/ingress/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: search-ingress
  namespace: search-infrastructure
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - search.yourdomain.com
    secretName: search-tls
  rules:
  - host: search.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: mcp-server
            port:
              number: 3000
```

**7. Horizontal Pod Autoscaler:**
```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-server-hpa
  namespace: search-infrastructure
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-server
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## MCP Server Implementation

### Project Structure

```
mcp-search-server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
├── src/
│   ├── index.ts                 # Main server entry
│   ├── config.ts                # Configuration
│   ├── clients/
│   │   ├── searxng.ts           # SearXNG API client
│   │   ├── crawl4ai.ts          # Crawl4AI client
│   │   └── redis.ts             # Redis cache client
│   ├── tools/
│   │   ├── search.ts            # Search tool implementation
│   │   ├── crawl.ts             # Crawl tool implementation
│   │   ├── extract.ts           # Content extraction tool
│   │   └── analyze.ts           # Analysis tools
│   ├── utils/
│   │   ├── errors.ts            # Error handling
│   │   ├── cache.ts             # Caching utilities
│   │   └── validators.ts        # Input validation
│   └── types/
│       └── index.ts             # TypeScript definitions
└── tests/
    ├── search.test.ts
    └── crawl.test.ts
```

### Implementation Code

**1. package.json:**
```json
{
  "name": "mcp-search-server",
  "version": "1.0.0",
  "description": "MCP Server for OSS Search Infrastructure",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "axios": "^1.6.0",
    "redis": "^4.6.0",
    "zod": "^3.22.0",
    "dotenv": "^16.3.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  }
}
```

**2. src/index.ts (Main Server):**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { searchTool, crawlTool, extractTool, analyzeTool } from "./tools/index.js";
import { config } from "./config.js";
import { initializeRedis } from "./clients/redis.js";

const server = new Server(
  {
    name: "mcp-search-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const tools: Tool[] = [
  {
    name: "web_search",
    description: "Search the web using SearXNG meta-search engine. Returns aggregated results from multiple search engines.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
        engines: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Specific search engines to use (e.g., ['google', 'duckduckgo'])",
          default: [],
        },
        categories: {
          type: "string",
          description: "Search category (general, images, videos, news, etc.)",
          default: "general",
        },
        language: {
          type: "string",
          description: "Search language code (e.g., 'en', 'es')",
          default: "en",
        },
        page: {
          type: "number",
          description: "Page number for pagination",
          default: 1,
        },
        safe_search: {
          type: "number",
          description: "Safe search level (0=off, 1=moderate, 2=strict)",
          default: 0,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_crawl",
    description: "Deep crawl and extract content from a URL using Crawl4AI. Supports JavaScript rendering, media extraction, and intelligent content parsing.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to crawl",
        },
        extraction_strategy: {
          type: "string",
          enum: ["auto", "llm", "cosine"],
          description: "Content extraction strategy",
          default: "auto",
        },
        chunking_strategy: {
          type: "string",
          enum: ["regex", "markdown", "sliding"],
          description: "How to chunk the extracted content",
          default: "markdown",
        },
        screenshot: {
          type: "boolean",
          description: "Capture screenshot of the page",
          default: false,
        },
        wait_for: {
          type: "string",
          description: "CSS selector to wait for before extraction",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds",
          default: 30,
        },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_content",
    description: "Extract specific content from already crawled pages or perform targeted extraction.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the page",
        },
        content_type: {
          type: "string",
          enum: ["text", "links", "images", "videos", "code"],
          description: "Type of content to extract",
        },
        selector: {
          type: "string",
          description: "Optional CSS selector for targeted extraction",
        },
      },
      required: ["url", "content_type"],
    },
  },
  {
    name: "analyze_search_results",
    description: "Analyze and rank search results based on relevance, freshness, and authority.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Original search query",
        },
        results: {
          type: "array",
          description: "Search results to analyze",
        },
        criteria: {
          type: "object",
          properties: {
            relevance_weight: { type: "number", default: 0.5 },
            freshness_weight: { type: "number", default: 0.3 },
            authority_weight: { type: "number", default: 0.2 },
          },
        },
      },
      required: ["query", "results"],
    },
  },
];

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "web_search":
        return await searchTool(request.params.arguments);
      case "web_crawl":
        return await crawlTool(request.params.arguments);
      case "extract_content":
        return await extractTool(request.params.arguments);
      case "analyze_search_results":
        return await analyzeTool(request.params.arguments);
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  // Initialize Redis
  await initializeRedis();

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("MCP Search Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**3. src/config.ts:**
```typescript
import dotenv from "dotenv";

dotenv.config();

export const config = {
  searxng: {
    url: process.env.SEARXNG_URL || "http://localhost:8080",
  },
  crawl4ai: {
    url: process.env.CRAWL4AI_URL || "http://localhost:8000",
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    ttl: {
      search: parseInt(process.env.CACHE_TTL_SEARCH || "3600"),
      crawl: parseInt(process.env.CACHE_TTL_CRAWL || "86400"),
    },
  },
  server: {
    port: parseInt(process.env.PORT || "3000"),
  },
};
```

**4. src/clients/searxng.ts:**
```typescript
import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";

export interface SearchParams {
  query: string;
  engines?: string[];
  categories?: string;
  language?: string;
  page?: number;
  safe_search?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  score: number;
  publishedDate?: string;
}

export class SearXNGClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.searxng.url,
      timeout: 30000,
    });
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    try {
      const queryParams: any = {
        q: params.query,
        format: "json",
        categories: params.categories || "general",
        language: params.language || "en",
        pageno: params.page || 1,
        safesearch: params.safe_search ?? 0,
      };

      if (params.engines && params.engines.length > 0) {
        queryParams.engines = params.engines.join(",");
      }

      const response = await this.client.get("/search", {
        params: queryParams,
      });

      return response.data.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content || result.description || "",
        engine: result.engine,
        score: result.score || 0,
        publishedDate: result.publishedDate,
      }));
    } catch (error) {
      throw new Error(
        `SearXNG search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const searxngClient = new SearXNGClient();
```

**5. src/clients/crawl4ai.ts:**
```typescript
import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";

export interface CrawlParams {
  url: string;
  extraction_strategy?: "auto" | "llm" | "cosine";
  chunking_strategy?: "regex" | "markdown" | "sliding";
  screenshot?: boolean;
  wait_for?: string;
  timeout?: number;
}

export interface CrawlResult {
  url: string;
  markdown: string;
  html: string;
  links: string[];
  media: {
    images: string[];
    videos: string[];
  };
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
  screenshot?: string; // base64 encoded
}

export class Crawl4AIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.crawl4ai.url,
      timeout: 60000,
    });
  }

  async crawl(params: CrawlParams): Promise<CrawlResult> {
    try {
      const response = await this.client.post("/crawl", {
        url: params.url,
        extraction_strategy: params.extraction_strategy || "auto",
        chunking_strategy: params.chunking_strategy || "markdown",
        screenshot: params.screenshot || false,
        wait_for: params.wait_for,
        timeout: params.timeout || 30,
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Crawl4AI failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async batchCrawl(urls: string[], params: Partial<CrawlParams> = {}): Promise<CrawlResult[]> {
    try {
      const response = await this.client.post("/crawl/batch", {
        urls,
        ...params,
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Batch crawl failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const crawl4aiClient = new Crawl4AIClient();
```

**6. src/clients/redis.ts:**
```typescript
import { createClient, RedisClientType } from "redis";
import { config } from "../config.js";

let redisClient: RedisClientType;

export async function initializeRedis(): Promise<void> {
  redisClient = createClient({
    url: config.redis.url,
  });

  redisClient.on("error", (err) => console.error("Redis Client Error", err));

  await redisClient.connect();
  console.log("Redis connected");
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redisClient.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttl: number): Promise<void> {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error("Cache delete error:", error);
  }
}

export function getRedisClient(): RedisClientType {
  return redisClient;
}
```

**7. src/tools/search.ts:**
```typescript
import { searxngClient, SearchParams } from "../clients/searxng.js";
import { getCached, setCache } from "../clients/redis.js";
import { config } from "../config.js";
import crypto from "crypto";

export async function searchTool(args: any) {
  const params: SearchParams = {
    query: args.query,
    engines: args.engines,
    categories: args.categories,
    language: args.language,
    page: args.page,
    safe_search: args.safe_search,
  };

  // Generate cache key
  const cacheKey = `search:${crypto
    .createHash("md5")
    .update(JSON.stringify(params))
    .digest("hex")}`;

  // Check cache
  const cached = await getCached(cacheKey);
  if (cached) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(cached, null, 2),
        },
      ],
    };
  }

  // Perform search
  const results = await searxngClient.search(params);

  // Cache results
  await setCache(cacheKey, results, config.redis.ttl.search);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            query: params.query,
            total_results: results.length,
            results: results.slice(0, 10), // Return top 10
          },
          null,
          2
        ),
      },
    ],
  };
}
```

**8. src/tools/crawl.ts:**
```typescript
import { crawl4aiClient, CrawlParams } from "../clients/crawl4ai.js";
import { getCached, setCache } from "../clients/redis.js";
import { config } from "../config.js";
import crypto from "crypto";

export async function crawlTool(args: any) {
  const params: CrawlParams = {
    url: args.url,
    extraction_strategy: args.extraction_strategy,
    chunking_strategy: args.chunking_strategy,
    screenshot: args.screenshot,
    wait_for: args.wait_for,
    timeout: args.timeout,
  };

  // Generate cache key
  const cacheKey = `crawl:${crypto
    .createHash("md5")
    .update(params.url)
    .digest("hex")}`;

  // Check cache
  const cached = await getCached(cacheKey);
  if (cached) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(cached, null, 2),
        },
      ],
    };
  }

  // Perform crawl
  const result = await crawl4aiClient.crawl(params);

  // Cache results
  await setCache(cacheKey, result, config.redis.ttl.crawl);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            url: result.url,
            title: result.metadata.title,
            content_length: result.markdown.length,
            links_found: result.links.length,
            images_found: result.media.images.length,
            markdown: result.markdown,
          },
          null,
          2
        ),
      },
    ],
  };
}
```

**9. Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Days 1-3: Environment Setup**
- [ ] Set up development environment
- [ ] Create Git repository
- [ ] Set up Docker Desktop or Kubernetes cluster
- [ ] Configure container registry (Docker Hub, GCR, ECR)

**Days 4-7: Core Services**
- [ ] Deploy SearXNG
  - Configure `settings.yml`
  - Set up rate limiting
  - Test basic search functionality
- [ ] Deploy Redis
  - Configure persistence
  - Test connection and caching

**Days 8-14: Crawl4AI Integration**
- [ ] Create Crawl4AI wrapper service
- [ ] Build FastAPI or Flask service
- [ ] Implement crawling endpoints
- [ ] Add Playwright browser automation
- [ ] Test various websites and extraction strategies

### Phase 2: MCP Server (Week 3-4)

**Days 15-18: Project Setup**
- [ ] Initialize Node.js/TypeScript project
- [ ] Install MCP SDK
- [ ] Set up project structure
- [ ] Configure TypeScript and linting

**Days 19-24: Tool Implementation**
- [ ] Implement `web_search` tool
- [ ] Implement `web_crawl` tool
- [ ] Implement `extract_content` tool
- [ ] Implement `analyze_search_results` tool
- [ ] Add proper error handling
- [ ] Add input validation with Zod

**Days 25-28: Integration & Testing**
- [ ] Integrate Redis caching
- [ ] Connect to SearXNG
- [ ] Connect to Crawl4AI service
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test with MCP Inspector

### Phase 3: Containerization (Week 5)

**Days 29-31: Docker Compose**
- [ ] Create Dockerfiles for all services
- [ ] Write docker-compose.yml
- [ ] Configure networking
- [ ] Set up volumes for persistence
- [ ] Test full stack locally

**Days 32-35: Kubernetes Migration**
- [ ] Create namespace and RBAC
- [ ] Write deployment manifests
- [ ] Create services and ingress
- [ ] Set up ConfigMaps and Secrets
- [ ] Configure persistent storage
- [ ] Set up HPA (Horizontal Pod Autoscaler)

### Phase 4: Production Readiness (Week 6)

**Days 36-38: Monitoring & Logging**
- [ ] Set up Prometheus metrics
- [ ] Configure Grafana dashboards
- [ ] Implement structured logging
- [ ] Set up alerting rules

**Days 39-40: Security**
- [ ] Implement API authentication
- [ ] Set up TLS/SSL certificates
- [ ] Configure network policies
- [ ] Run security scans

**Days 41-42: Documentation & Deployment**
- [ ] Write API documentation
- [ ] Create runbooks
- [ ] Deploy to staging
- [ ] Perform load testing
- [ ] Deploy to production

---

## Monitoring & Scaling

### Metrics to Track

**SearXNG:**
- Requests per second
- Average response time
- Error rate by engine
- Cache hit ratio

**Crawl4AI:**
- Concurrent crawls
- Average crawl time
- Success/failure rate
- Memory usage per crawl

**MCP Server:**
- Tool invocations
- Latency per tool
- Error rates
- Cache effectiveness

**Redis:**
- Memory usage
- Cache hit/miss ratio
- Eviction rate
- Connection count

### Prometheus Configuration

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'mcp-server'
    static_configs:
      - targets: ['mcp-server:3000']
  
  - job_name: 'searxng'
    static_configs:
      - targets: ['searxng:8080']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### Grafana Dashboard

Key panels:
1. Request rate (time series)
2. Latency distribution (heatmap)
3. Error rate (gauge)
4. Cache hit ratio (stat)
5. Resource usage (CPU/Memory)

### Scaling Strategy

**Horizontal Scaling:**
- MCP Server: 3-10 replicas
- SearXNG: 2-5 replicas
- Crawl4AI: 2-8 replicas (resource intensive)

**Vertical Scaling:**
- Crawl4AI needs more memory (2-4GB per pod)
- Redis needs sufficient memory for cache
- SearXNG is lightweight (512MB sufficient)

**Auto-scaling Rules:**
```yaml
# CPU-based
targetCPUUtilizationPercentage: 70

# Memory-based
targetMemoryUtilizationPercentage: 80

# Custom metric (requests per second)
- type: Pods
  pods:
    metric:
      name: http_requests_per_second
    target:
      type: AverageValue
      averageValue: "1000"
```

---

## Cost Optimization

### Infrastructure Costs

**Development:**
- Local Docker: $0
- Small Kubernetes cluster: $50-100/month

**Production (Medium Scale):**
- Kubernetes cluster (3 nodes): $200-400/month
- Load balancer: $20-40/month
- Storage (100GB SSD): $10-20/month
- Bandwidth: Variable

**Total Estimated:** $250-500/month

### Cost vs. Commercial APIs

| Service | Cost (1M requests) |
|---------|-------------------|
| Tavily API | $500-1000 |
| Serper API | $500-800 |
| Brave Search API | $500 |
| **OSS Solution** | **$250-500/month (unlimited)** |

**Break-even:** ~1M requests/month

---

## Client Integration

### Using the MCP Server

**1. Configure MCP Client (Claude Desktop):**

```json
{
  "mcpServers": {
    "search": {
      "command": "node",
      "args": ["/path/to/mcp-search-server/dist/index.js"],
      "env": {
        "SEARXNG_URL": "http://your-domain.com/searxng",
        "CRAWL4AI_URL": "http://your-domain.com/crawl4ai",
        "REDIS_URL": "redis://your-domain.com:6379"
      }
    }
  }
}
```

**2. Using via Streamable HTTP (alternative):**

Modify the MCP server to support HTTP transport:

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();

app.post("/mcp", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.listen(3000);
```

**3. Example Usage:**

```javascript
// AI Agent using the MCP server
const result = await mcpClient.callTool("web_search", {
  query: "latest AI developments",
  engines: ["google", "duckduckgo"],
  language: "en"
});

const crawlResult = await mcpClient.callTool("web_crawl", {
  url: result.results[0].url,
  extraction_strategy: "llm"
});
```

---

## Security Considerations

### Authentication & Authorization

1. **API Keys:** Implement API key authentication for MCP server
2. **Rate Limiting:** Per-client rate limits via Redis
3. **Network Policies:** Restrict inter-pod communication
4. **Secrets Management:** Use Kubernetes secrets or external vault

### Privacy

1. **No Logging of Queries:** Disable query logging in SearXNG
2. **No Tracking:** Disable all tracking features
3. **Data Retention:** Configure short TTL for cached data
4. **GDPR Compliance:** Implement data deletion endpoints

### Network Security

```yaml
# Network Policy Example
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: mcp-server-policy
spec:
  podSelector:
    matchLabels:
      app: mcp-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: searxng
  - to:
    - podSelector:
        matchLabels:
          app: crawl4ai
```

---

## Troubleshooting Guide

### Common Issues

**1. SearXNG Returns No Results:**
- Check if search engines are blocked
- Verify rate limits aren't exceeded
- Check network connectivity
- Review searxng logs: `kubectl logs -n search-infrastructure searxng-xxx`

**2. Crawl4AI Timeouts:**
- Increase timeout values
- Check target website robots.txt
- Verify Playwright browsers are installed
- Scale up Crawl4AI replicas

**3. Redis Connection Errors:**
- Verify Redis pod is running
- Check service endpoints
- Review connection string
- Check network policies

**4. MCP Server Not Responding:**
- Check stdio transport configuration
- Verify environment variables
- Review server logs
- Test with MCP Inspector

---

## Future Enhancements

### Planned Features

1. **Vector Search Integration**
   - Add Qdrant or Weaviate
   - Semantic search capabilities
   - Document embeddings

2. **Advanced Analytics**
   - Search query analytics
   - Popular queries dashboard
   - Performance insights

3. **Multi-region Deployment**
   - Geo-distributed caching
   - Region-specific search engines
   - Lower latency

4. **AI-Powered Features**
   - Query rewriting
   - Result summarization
   - Automatic fact-checking

5. **Additional Tools**
   - Image search
   - Video search
   - News aggregation
   - Academic paper search

---

## Conclusion

This architecture provides a production-ready, scalable OSS search infrastructure that can replace commercial APIs while maintaining control over data, privacy, and costs. The MCP server integration enables seamless use with AI agents and LLM clients.

**Key Benefits:**
- ✅ No vendor lock-in
- ✅ Complete data privacy
- ✅ Unlimited requests
- ✅ Customizable and extensible
- ✅ Cost-effective at scale
- ✅ MCP-native integration

**Next Steps:**
1. Review the implementation plan
2. Set up development environment
3. Start with Phase 1 (Foundation)
4. Iterate and test each component
5. Deploy to production incrementally

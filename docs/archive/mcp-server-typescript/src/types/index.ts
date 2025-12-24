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
  screenshot?: string;
  timestamp?: string;
}

export interface ExtractParams {
  url: string;
  content_type: "text" | "links" | "images" | "videos" | "code";
  selector?: string;
}

export interface AnalyzeParams {
  query: string;
  results: SearchResult[];
  criteria?: {
    relevance_weight?: number;
    freshness_weight?: number;
    authority_weight?: number;
  };
}

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

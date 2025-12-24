import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import type { SearchParams, SearchResult } from "../types/index.js";

export class SearXNGClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.searxng.url,
      timeout: config.searxng.timeout,
      headers: {
        "Accept": "application/json",
        "User-Agent": "MCP-Search-Server/1.0",
        "X-Forwarded-For": "10.0.0.1", // Internal cluster IP for bot detection bypass
        "X-Real-IP": "10.0.0.1", // Internal cluster IP for bot detection bypass
      },
    });
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    try {
      const queryParams: Record<string, any> = {
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

      if (!response.data || !response.data.results) {
        return [];
      }

      return response.data.results.map((result: any) => ({
        title: result.title || "",
        url: result.url || "",
        content: result.content || result.description || "",
        engine: result.engine || "unknown",
        score: result.score || 0,
        publishedDate: result.publishedDate,
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `SearXNG search failed: ${error.message} (Status: ${error.response?.status || "N/A"})`
        );
      }
      throw new Error(
        `SearXNG search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get("/healthz", {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const searxngClient = new SearXNGClient();

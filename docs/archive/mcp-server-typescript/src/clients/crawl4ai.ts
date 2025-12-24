import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";
import type { CrawlParams, CrawlResult } from "../types/index.js";

export class Crawl4AIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.crawl4ai.url,
      timeout: config.crawl4ai.timeout,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });
  }

  async crawl(params: CrawlParams): Promise<CrawlResult> {
    try {
      const requestBody = {
        url: params.url,
        extraction_strategy: params.extraction_strategy || "auto",
        chunking_strategy: params.chunking_strategy || "markdown",
        screenshot: params.screenshot || false,
        wait_for: params.wait_for,
        timeout: params.timeout || 30,
      };

      const response = await this.client.post("/crawl", requestBody);

      if (!response.data) {
        throw new Error("No data returned from Crawl4AI");
      }

      return {
        url: response.data.url || params.url,
        markdown: response.data.markdown || "",
        html: response.data.html || "",
        links: response.data.links || [],
        media: {
          images: response.data.media?.images || [],
          videos: response.data.media?.videos || [],
        },
        metadata: {
          title: response.data.metadata?.title || "",
          description: response.data.metadata?.description || "",
          keywords: response.data.metadata?.keywords || [],
        },
        screenshot: response.data.screenshot,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.detail || error.message;
        throw new Error(
          `Crawl4AI failed: ${errorMsg} (Status: ${error.response?.status || "N/A"})`
        );
      }
      throw new Error(
        `Crawl4AI failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async batchCrawl(
    urls: string[],
    params: Partial<CrawlParams> = {}
  ): Promise<CrawlResult[]> {
    try {
      const requestBody = {
        urls,
        extraction_strategy: params.extraction_strategy || "auto",
        chunking_strategy: params.chunking_strategy || "markdown",
        screenshot: params.screenshot || false,
        timeout: params.timeout || 30,
      };

      const response = await this.client.post("/crawl/batch", requestBody);

      if (!response.data) {
        return [];
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Batch crawl failed: ${error.message} (Status: ${error.response?.status || "N/A"})`
        );
      }
      throw new Error(
        `Batch crawl failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get("/health", {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const crawl4aiClient = new Crawl4AIClient();

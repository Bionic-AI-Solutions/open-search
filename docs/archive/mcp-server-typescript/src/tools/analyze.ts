import type { AnalyzeParams, SearchResult, ToolResponse } from "../types/index.js";

export async function analyzeTool(args: any): Promise<ToolResponse> {
  try {
    const params: AnalyzeParams = {
      query: args.query,
      results: args.results,
      criteria: args.criteria || {
        relevance_weight: 0.5,
        freshness_weight: 0.3,
        authority_weight: 0.2,
      },
    };

    const { relevance_weight, freshness_weight, authority_weight } =
      params.criteria;

    // Analyze and score each result
    const analyzedResults = params.results.map((result: SearchResult) => {
      // Calculate relevance score (based on query terms in title/content)
      const queryTerms = params.query.toLowerCase().split(/\s+/);
      const titleLower = result.title.toLowerCase();
      const contentLower = result.content.toLowerCase();

      const relevanceScore =
        queryTerms.reduce((score, term) => {
          if (titleLower.includes(term)) score += 2;
          if (contentLower.includes(term)) score += 1;
          return score;
        }, 0) / (queryTerms.length * 3);

      // Calculate freshness score (if publishedDate is available)
      let freshnessScore = 0.5; // Default neutral score
      if (result.publishedDate) {
        try {
          const publishedTime = new Date(result.publishedDate).getTime();
          const now = Date.now();
          const daysSincePublished = (now - publishedTime) / (1000 * 60 * 60 * 24);

          // Fresher content gets higher scores
          if (daysSincePublished < 7) freshnessScore = 1.0;
          else if (daysSincePublished < 30) freshnessScore = 0.8;
          else if (daysSincePublished < 90) freshnessScore = 0.6;
          else if (daysSincePublished < 365) freshnessScore = 0.4;
          else freshnessScore = 0.2;
        } catch {
          // Invalid date format, use default
        }
      }

      // Authority score (based on engine score)
      const authorityScore = Math.min(result.score / 100, 1);

      // Calculate weighted final score
      const finalScore =
        relevanceScore * relevance_weight! +
        freshnessScore * freshness_weight! +
        authorityScore * authority_weight!;

      return {
        ...result,
        analysis: {
          relevance_score: relevanceScore,
          freshness_score: freshnessScore,
          authority_score: authorityScore,
          final_score: finalScore,
        },
      };
    });

    // Sort by final score
    const sortedResults = analyzedResults.sort(
      (a, b) => b.analysis.final_score - a.analysis.final_score
    );

    // Generate summary statistics
    const summary = {
      total_results: sortedResults.length,
      average_relevance: 
        sortedResults.reduce((sum, r) => sum + r.analysis.relevance_score, 0) /
        sortedResults.length,
      average_freshness:
        sortedResults.reduce((sum, r) => sum + r.analysis.freshness_score, 0) /
        sortedResults.length,
      average_authority:
        sortedResults.reduce((sum, r) => sum + r.analysis.authority_score, 0) /
        sortedResults.length,
      engines_used: [...new Set(sortedResults.map((r) => r.engine))],
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: params.query,
              criteria: params.criteria,
              summary,
              top_results: sortedResults.slice(0, 10),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("Analyze tool error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

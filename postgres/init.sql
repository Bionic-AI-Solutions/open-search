-- Search Analytics Database Schema
-- Initialization script for PostgreSQL

-- Search queries table
CREATE TABLE IF NOT EXISTS search_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    engine TEXT,
    results_count INTEGER,
    response_time_ms INTEGER,
    client_id TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_queries_timestamp ON search_queries(timestamp);
CREATE INDEX idx_search_queries_query ON search_queries(query);
CREATE INDEX idx_search_queries_client ON search_queries(client_id);

-- Crawl jobs table
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    content_hash TEXT,
    extraction_strategy TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX idx_crawl_jobs_url ON crawl_jobs(url);
CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_created ON crawl_jobs(created_at);

-- Cache statistics table
CREATE TABLE IF NOT EXISTS cache_stats (
    id SERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL UNIQUE,
    hit_count INTEGER DEFAULT 0,
    miss_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cache_stats_key ON cache_stats(cache_key);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    client_id TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_usage_timestamp ON api_usage(timestamp);
CREATE INDEX idx_api_usage_endpoint ON api_usage(endpoint);

-- Create views for analytics

-- Daily search statistics
CREATE OR REPLACE VIEW search_stats_daily AS
SELECT 
    DATE(timestamp) as date,
    COUNT(*) as total_searches,
    COUNT(DISTINCT query) as unique_queries,
    COUNT(DISTINCT client_id) as unique_clients,
    AVG(response_time_ms) as avg_response_time_ms,
    ROUND(AVG(results_count)) as avg_results_count
FROM search_queries
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Popular queries (last 7 days)
CREATE OR REPLACE VIEW popular_queries_recent AS
SELECT 
    query,
    COUNT(*) as search_count,
    AVG(results_count) as avg_results,
    MAX(timestamp) as last_searched
FROM search_queries
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY query
ORDER BY search_count DESC
LIMIT 100;

-- Crawl job statistics
CREATE OR REPLACE VIEW crawl_stats AS
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM crawl_jobs
WHERE completed_at IS NOT NULL
GROUP BY status;

-- API endpoint performance
CREATE OR REPLACE VIEW api_performance AS
SELECT 
    endpoint,
    method,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_response_time_ms,
    MIN(response_time_ms) as min_response_time_ms,
    MAX(response_time_ms) as max_response_time_ms,
    ROUND(100.0 * SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM api_usage
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY endpoint, method
ORDER BY request_count DESC;

-- Cache hit rate
CREATE OR REPLACE VIEW cache_performance AS
SELECT 
    COUNT(*) as total_keys,
    SUM(hit_count) as total_hits,
    SUM(miss_count) as total_misses,
    ROUND(100.0 * SUM(hit_count) / NULLIF(SUM(hit_count) + SUM(miss_count), 0), 2) as hit_rate_percent
FROM cache_stats;

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO searchuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO searchuser;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO searchuser;

-- Insert some sample data for testing (optional)
-- Uncomment if you want test data

-- INSERT INTO search_queries (query, engine, results_count, response_time_ms, client_id)
-- VALUES 
--     ('artificial intelligence', 'google', 42, 234, 'test-client-1'),
--     ('machine learning tutorials', 'duckduckgo', 38, 187, 'test-client-1'),
--     ('python web scraping', 'brave', 51, 312, 'test-client-2');

-- INSERT INTO crawl_jobs (url, status, extraction_strategy, completed_at)
-- VALUES 
--     ('https://example.com', 'completed', 'auto', NOW()),
--     ('https://example.org', 'completed', 'llm', NOW()),
--     ('https://example.net', 'failed', 'auto', NOW());

-- Helpful functions

-- Function to clean old data (call periodically)
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 90)
RETURNS void AS $$
BEGIN
    DELETE FROM search_queries WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
    DELETE FROM crawl_jobs WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    DELETE FROM api_usage WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to update cache statistics
CREATE OR REPLACE FUNCTION update_cache_stats(key TEXT, is_hit BOOLEAN)
RETURNS void AS $$
BEGIN
    INSERT INTO cache_stats (cache_key, hit_count, miss_count, last_accessed)
    VALUES (key, 
            CASE WHEN is_hit THEN 1 ELSE 0 END,
            CASE WHEN is_hit THEN 0 ELSE 1 END,
            NOW())
    ON CONFLICT (cache_key) 
    DO UPDATE SET 
        hit_count = cache_stats.hit_count + CASE WHEN is_hit THEN 1 ELSE 0 END,
        miss_count = cache_stats.miss_count + CASE WHEN is_hit THEN 0 ELSE 1 END,
        last_accessed = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to cleanup old data (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-data', '0 2 * * *', 'SELECT cleanup_old_data(90);');

FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (as root before switching to non-root user)
# Install both chromium and chromium headless shell
RUN playwright install chromium && \
    playwright install chromium-headless-shell && \
    playwright install-deps chromium || true

# Copy application code
COPY main.py .

# Create logs directory
RUN mkdir -p /app/logs

# Create non-root user (skip if UID exists)
# Ensure the user has access to Playwright browsers
# Use the same UID as pwuser (1000) or change ownership
RUN (useradd -m -u 1000 crawluser 2>/dev/null || true) && \
    chown -R 1000:1000 /app && \
    chown -R 1000:1000 /ms-playwright || true
USER 1000

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

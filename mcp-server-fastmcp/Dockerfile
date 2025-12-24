FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server.py .

# Run as non-root user
RUN useradd -m -u 1001 mcp && chown -R mcp:mcp /app
USER mcp

# FastMCP automatically handles transport (stdio, HTTP, SSE)
CMD ["python", "server.py"]


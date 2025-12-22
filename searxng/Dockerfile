FROM searxng/searxng:latest

# Copy configuration files
COPY settings.yml /etc/searxng/settings.yml
COPY limiter.toml /etc/searxng/limiter.toml

# Ensure proper permissions
USER root
RUN chown searxng:searxng /etc/searxng/settings.yml /etc/searxng/limiter.toml && \
    chmod 644 /etc/searxng/settings.yml /etc/searxng/limiter.toml
USER searxng

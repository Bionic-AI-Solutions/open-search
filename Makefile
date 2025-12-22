# OSS Search Infrastructure - Makefile
# Convenient commands for common operations

.PHONY: help setup build start stop restart logs clean test deploy-k8s

# Default target
.DEFAULT_GOAL := help

# Variables
DOCKER_COMPOSE := docker-compose
KUBECTL := kubectl
NAMESPACE := search-infrastructure

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)OSS Search Infrastructure - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

setup: ## Initial setup - creates directories and generates secrets
	@echo "$(GREEN)Running initial setup...$(NC)"
	@chmod +x setup.sh
	@./setup.sh

build: ## Build all Docker images
	@echo "$(GREEN)Building Docker images...$(NC)"
	@$(DOCKER_COMPOSE) build

start: ## Start all services
	@echo "$(GREEN)Starting services...$(NC)"
	@$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "Access URLs:"
	@echo "  MCP Server:  http://localhost:3000"
	@echo "  SearXNG:     http://localhost:8080"
	@echo "  Crawl4AI:    http://localhost:8000"

stop: ## Stop all services
	@echo "$(YELLOW)Stopping services...$(NC)"
	@$(DOCKER_COMPOSE) down

restart: ## Restart all services
	@echo "$(YELLOW)Restarting services...$(NC)"
	@$(DOCKER_COMPOSE) restart

logs: ## Show logs from all services
	@$(DOCKER_COMPOSE) logs -f

logs-mcp: ## Show MCP server logs
	@$(DOCKER_COMPOSE) logs -f mcp-server

logs-searxng: ## Show SearXNG logs
	@$(DOCKER_COMPOSE) logs -f searxng

logs-crawl4ai: ## Show Crawl4AI logs
	@$(DOCKER_COMPOSE) logs -f crawl4ai

status: ## Show status of all services
	@$(DOCKER_COMPOSE) ps

clean: ## Stop and remove all containers, networks, and volumes
	@echo "$(RED)Cleaning up...$(NC)"
	@$(DOCKER_COMPOSE) down -v
	@echo "$(GREEN)Cleanup complete$(NC)"

clean-cache: ## Clear Redis cache
	@echo "$(YELLOW)Clearing Redis cache...$(NC)"
	@docker exec -it redis-cache redis-cli FLUSHALL
	@echo "$(GREEN)Cache cleared$(NC)"

shell-mcp: ## Open shell in MCP server container
	@docker exec -it mcp-search-server sh

shell-crawl4ai: ## Open shell in Crawl4AI container
	@docker exec -it crawl4ai-service bash

shell-redis: ## Open Redis CLI
	@docker exec -it redis-cache redis-cli

shell-postgres: ## Open PostgreSQL CLI
	@docker exec -it search-analytics psql -U searchuser -d search_analytics

test-searxng: ## Test SearXNG search
	@echo "$(GREEN)Testing SearXNG...$(NC)"
	@curl -s "http://localhost:8080/search?q=test&format=json" | jq '.results[0:3]'

test-crawl4ai: ## Test Crawl4AI
	@echo "$(GREEN)Testing Crawl4AI...$(NC)"
	@curl -s -X POST http://localhost:8000/crawl \
		-H "Content-Type: application/json" \
		-d '{"url": "https://example.com"}' | jq '.metadata'

test-mcp: ## Test MCP server health
	@echo "$(GREEN)Testing MCP server...$(NC)"
	@curl -s http://localhost:3000/health | jq .

test-all: test-searxng test-crawl4ai test-mcp ## Run all tests

# Kubernetes commands
k8s-namespace: ## Create Kubernetes namespace
	@echo "$(GREEN)Creating namespace...$(NC)"
	@$(KUBECTL) apply -f k8s/namespace.yaml

k8s-secrets: ## Create Kubernetes secrets
	@echo "$(GREEN)Creating secrets...$(NC)"
	@$(KUBECTL) create secret generic search-secrets \
		--from-literal=searxng-secret=$$(openssl rand -hex 32) \
		--from-literal=db-password=$$(openssl rand -hex 16) \
		-n $(NAMESPACE) --dry-run=client -o yaml | $(KUBECTL) apply -f -

k8s-deploy: ## Deploy to Kubernetes
	@echo "$(GREEN)Deploying to Kubernetes...$(NC)"
	@$(KUBECTL) apply -f k8s/deployments/
	@$(KUBECTL) apply -f k8s/services/
	@$(KUBECTL) apply -f k8s/ingress/
	@echo "$(GREEN)Deployment complete$(NC)"

k8s-status: ## Show Kubernetes deployment status
	@echo "$(GREEN)Pods:$(NC)"
	@$(KUBECTL) get pods -n $(NAMESPACE)
	@echo ""
	@echo "$(GREEN)Services:$(NC)"
	@$(KUBECTL) get svc -n $(NAMESPACE)
	@echo ""
	@echo "$(GREEN)Ingress:$(NC)"
	@$(KUBECTL) get ingress -n $(NAMESPACE)

k8s-logs: ## Show Kubernetes logs
	@$(KUBECTL) logs -f -n $(NAMESPACE) deployment/mcp-server

k8s-scale: ## Scale MCP server deployment (usage: make k8s-scale REPLICAS=5)
	@$(KUBECTL) scale deployment mcp-server --replicas=$(REPLICAS) -n $(NAMESPACE)

k8s-delete: ## Delete Kubernetes deployment
	@echo "$(RED)Deleting Kubernetes resources...$(NC)"
	@$(KUBECTL) delete -f k8s/deployments/
	@$(KUBECTL) delete -f k8s/services/
	@$(KUBECTL) delete -f k8s/ingress/
	@$(KUBECTL) delete namespace $(NAMESPACE)

# Development commands
dev-mcp: ## Run MCP server in development mode
	@echo "$(GREEN)Starting MCP server in dev mode...$(NC)"
	@cd mcp-server && npm install && npm run dev

dev-crawl4ai: ## Run Crawl4AI in development mode
	@echo "$(GREEN)Starting Crawl4AI in dev mode...$(NC)"
	@cd crawl4ai-service && pip install -r requirements.txt && uvicorn main:app --reload

# Monitoring commands
stats: ## Show Docker container stats
	@docker stats --no-stream

disk-usage: ## Show Docker disk usage
	@docker system df

# Backup commands
backup-redis: ## Backup Redis data
	@echo "$(GREEN)Backing up Redis...$(NC)"
	@docker exec redis-cache redis-cli SAVE
	@docker cp redis-cache:/data/dump.rdb ./backup/redis-dump-$$(date +%Y%m%d-%H%M%S).rdb
	@echo "$(GREEN)Redis backup complete$(NC)"

backup-postgres: ## Backup PostgreSQL database
	@echo "$(GREEN)Backing up PostgreSQL...$(NC)"
	@docker exec search-analytics pg_dump -U searchuser search_analytics > ./backup/postgres-$$(date +%Y%m%d-%H%M%S).sql
	@echo "$(GREEN)PostgreSQL backup complete$(NC)"

# Update commands
update: ## Pull latest images and restart
	@echo "$(GREEN)Updating services...$(NC)"
	@$(DOCKER_COMPOSE) pull
	@$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Update complete$(NC)"

# Documentation
docs: ## Generate documentation
	@echo "$(GREEN)Documentation available in:$(NC)"
	@echo "  - README.md"
	@echo "  - oss-search-architecture.md"

# Install dependencies
install-node: ## Install Node.js dependencies for MCP server
	@echo "$(GREEN)Installing Node.js dependencies...$(NC)"
	@cd mcp-server && npm install

install-python: ## Install Python dependencies for Crawl4AI
	@echo "$(GREEN)Installing Python dependencies...$(NC)"
	@cd crawl4ai-service && pip install -r requirements.txt

# Health checks
health: ## Check health of all services
	@echo "$(GREEN)Checking service health...$(NC)"
	@echo "MCP Server:"
	@curl -s http://localhost:3000/health || echo "$(RED)MCP Server not responding$(NC)"
	@echo ""
	@echo "Crawl4AI:"
	@curl -s http://localhost:8000/health || echo "$(RED)Crawl4AI not responding$(NC)"
	@echo ""
	@echo "Redis:"
	@docker exec -it redis-cache redis-cli ping || echo "$(RED)Redis not responding$(NC)"
	@echo ""
	@echo "SearXNG:"
	@curl -s http://localhost:8080/healthz || echo "$(RED)SearXNG not responding$(NC)"

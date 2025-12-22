# Search Infrastructure Deployment Guide

This guide explains how to deploy the search infrastructure from scratch using the provided manifests.

## Prerequisites

- `kubectl` configured and connected to the cluster
- Access to `pg` and `redis` namespaces to copy secrets
- Docker images built and pushed to Docker Hub:
  - `docker4zerocool/mcp-search-server:latest`
  - `docker4zerocool/crawl4ai-service:latest`
  - `searxng/searxng:latest` (public image)

## Quick Deployment

Run the deployment script:

```bash
/workspace/k8s/deploy.sh
```

## Manual Deployment Steps

### Step 1: Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### Step 2: Create RBAC

This allows the `search-infrastructure` namespace to read secrets from `pg` and `redis` namespaces:

```bash
kubectl apply -f k8s/rbac/secret-reader-rbac.yaml
```

### Step 3: Create Secrets

#### Docker Registry Secret
```bash
kubectl apply -f k8s/secrets/docker-registry-secret.yaml
```

#### SearXNG Secret
```bash
SEARXNG_SECRET=$(openssl rand -hex 32)
kubectl create secret generic searxng-secret \
  --from-literal=secret=${SEARXNG_SECRET} \
  -n search-infrastructure
```

#### Copy Secrets from Other Namespaces

**Redis Secret:**
```bash
kubectl apply -f k8s/secrets/redb-mcp-database.yaml
```

If the file doesn't exist, create it:
```bash
kubectl get secret redb-mcp-database -n redis -o json | \
  jq '{apiVersion: "v1", kind: "Secret", metadata: {name: "redb-mcp-database", namespace: "search-infrastructure"}, type: .type, data: .data}' | \
  kubectl apply -f -
```

**PostgreSQL Secret:**
```bash
kubectl apply -f k8s/secrets/pg-ceph-app.yaml
```

If the file doesn't exist, create it:
```bash
kubectl get secret pg-ceph-app -n pg -o json | \
  jq '{apiVersion: "v1", kind: "Secret", metadata: {name: "pg-ceph-app", namespace: "search-infrastructure"}, type: .type, data: .data}' | \
  kubectl apply -f -
```

### Step 4: Create ConfigMaps

```bash
kubectl apply -f k8s/configmaps/app-config.yaml
kubectl apply -f k8s/configmaps/searxng-config.yaml
```

### Step 5: Create Services

```bash
kubectl apply -f k8s/services/searxng.yaml
kubectl apply -f k8s/services/crawl4ai.yaml
kubectl apply -f k8s/services/mcp-server.yaml
```

### Step 6: Create Deployments

```bash
kubectl apply -f k8s/deployments/searxng.yaml
kubectl apply -f k8s/deployments/crawl4ai.yaml
kubectl apply -f k8s/deployments/mcp-server.yaml
```

### Step 7: Create HPA (Optional)

```bash
kubectl apply -f k8s/deployments/mcp-server-hpa.yaml
```

### Step 8: Create Ingress (Optional)

```bash
kubectl apply -f k8s/ingress/ingress.yaml
```

## Verification

Check pod status:

```bash
kubectl get pods -n search-infrastructure
```

All pods should be in `Running` state with `READY 1/1`:

- **SearXNG**: 3 replicas
- **Crawl4AI**: 2 replicas  
- **MCP Server**: 3 replicas

## Important Notes

1. **MCP Server**: Uses stdio transport, requires `stdin: true` in deployment (already configured)
2. **Secrets**: Must be copied to `search-infrastructure` namespace as Kubernetes doesn't support cross-namespace secret references
3. **RBAC**: Required to allow reading secrets from other namespaces (for future reference)
4. **Health Checks**: MCP server uses process-based health checks (not HTTP) due to stdio transport

## Troubleshooting

### Pods stuck in CreateContainerConfigError

This usually means secrets are missing. Verify:

```bash
kubectl get secrets -n search-infrastructure
```

You should see:
- `docker-registry-secret`
- `searxng-secret`
- `redb-mcp-database`
- `pg-ceph-app`

### MCP Server keeps restarting

Ensure `stdin: true` is set in the deployment (already configured in manifests).

### Crawl4AI import errors

The manifests use updated crawl4ai version (>=0.7.8) which removed `MarkdownChunking`. The code uses `RegexChunking` instead.


# Quick Start Guide - Search Infrastructure Deployment

This guide provides step-by-step instructions to deploy the search infrastructure using the existing PostgreSQL and Redis clusters.

## Prerequisites

- `kubectl` configured and connected to the cluster
- Access to `pg` and `redis` namespaces
- Docker images built and pushed to your registry
- Permissions to create resources in `search-infrastructure` namespace

## Step 1: Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

## Step 2: Create Secrets

### 2.1 SearXNG Secret

```bash
SEARXNG_SECRET=$(openssl rand -hex 32)
kubectl create secret generic searxng-secret \
  --from-literal=secret=$SEARXNG_SECRET \
  -n search-infrastructure
```

### 2.2 Verify Access to Existing Secrets

```bash
# Verify PostgreSQL secret access
kubectl get secret pg-ceph-app -n pg

# Verify Redis secret access
kubectl get secret redb-mcp-database -n redis
```

**Note:** If you get "forbidden" errors, you may need to create a Role and RoleBinding to allow access to secrets in other namespaces.

## Step 3: Create ConfigMaps

```bash
kubectl apply -f k8s/configmaps/app-config.yaml
kubectl apply -f k8s/configmaps/searxng-config.yaml
```

## Step 4: Update Deployment Manifests

### 4.1 Update Image References

Replace `your-registry.io` with your actual registry in:
- `k8s/deployments/mcp-server-updated.yaml.example`
- `k8s/deployments/crawl4ai-updated.yaml.example`
- `k8s/deployments/searxng-updated.yaml.example`

### 4.2 Copy Example Files

```bash
cp k8s/deployments/mcp-server-updated.yaml.example k8s/deployments/mcp-server.yaml
cp k8s/deployments/crawl4ai-updated.yaml.example k8s/deployments/crawl4ai.yaml
cp k8s/deployments/searxng-updated.yaml.example k8s/deployments/searxng.yaml
```

Then edit the files to update image references.

## Step 5: Deploy Services

### 5.1 Deploy SearXNG

```bash
kubectl apply -f k8s/deployments/searxng.yaml
kubectl apply -f k8s/services/searxng.yaml

# Wait for readiness
kubectl wait --for=condition=ready pod -l app=searxng -n search-infrastructure --timeout=120s
```

### 5.2 Deploy Crawl4AI

```bash
kubectl apply -f k8s/deployments/crawl4ai.yaml
kubectl apply -f k8s/services/crawl4ai.yaml

# Wait for readiness (may take longer due to Playwright installation)
kubectl wait --for=condition=ready pod -l app=crawl4ai -n search-infrastructure --timeout=300s
```

### 5.3 Deploy MCP Server

```bash
kubectl apply -f k8s/deployments/mcp-server.yaml
kubectl apply -f k8s/services/mcp-server.yaml

# Wait for readiness
kubectl wait --for=condition=ready pod -l app=mcp-server -n search-infrastructure --timeout=120s
```

## Step 6: Verify Deployments

### 6.1 Check Pod Status

```bash
kubectl get pods -n search-infrastructure
```

All pods should be in `Running` state.

### 6.2 Check Service Endpoints

```bash
kubectl get svc -n search-infrastructure
kubectl get endpoints -n search-infrastructure
```

### 6.3 Test Connections

```bash
# Test SearXNG
kubectl run -it --rm test-searxng --image=curlimages/curl --restart=Never -- \
  curl http://searxng.search-infrastructure.svc.cluster.local:8080/healthz

# Test Crawl4AI
kubectl run -it --rm test-crawl4ai --image=curlimages/curl --restart=Never -- \
  curl http://crawl4ai.search-infrastructure.svc.cluster.local:8000/health

# Test MCP Server
kubectl run -it --rm test-mcp --image=curlimages/curl --restart=Never -- \
  curl http://mcp-server.search-infrastructure.svc.cluster.local:3000/health
```

## Step 7: Configure Ingress (Optional)

If you want external access:

```bash
# Update ingress.yaml with your domain
kubectl apply -f k8s/ingress/ingress.yaml
```

## Step 8: Verify Database Connections

### 8.1 Test PostgreSQL Connection

```bash
# Get credentials
DB_USER=$(kubectl get secret pg-ceph-app -n pg -o jsonpath='{.data.username}' | base64 -d)
DB_PASS=$(kubectl get secret pg-ceph-app -n pg -o jsonpath='{.data.password}' | base64 -d)
DB_NAME=$(kubectl get secret pg-ceph-app -n pg -o jsonpath='{.data.dbname}' | base64 -d)

# Test connection
kubectl run -it --rm test-pg --image=postgres:15-alpine --restart=Never -- \
  psql "postgresql://${DB_USER}:${DB_PASS}@pg-ceph-rw.pg.svc.cluster.local:5432/${DB_NAME}" -c "SELECT version();"
```

### 8.2 Test Redis Connection

```bash
# Get password
REDIS_PASS=$(kubectl get secret redb-mcp-database -n redis -o jsonpath='{.data.password}' | base64 -d)

# Test connection
kubectl run -it --rm test-redis --image=redis:7-alpine --restart=Never -- \
  redis-cli -h mcp-database.redis.svc.cluster.local -p 10515 -a "${REDIS_PASS}" ping
```

## Troubleshooting

### Issue: Cannot access secrets from other namespaces

**Solution:** Create a Role and RoleBinding:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: pg
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["pg-ceph-app"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: pg
  name: read-secrets
subjects:
- kind: ServiceAccount
  name: default
  namespace: search-infrastructure
roleRef:
  kind: Role
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

Repeat for `redis` namespace with `redb-mcp-database` secret.

### Issue: Pods cannot resolve service DNS

**Solution:** Check CoreDNS is running:
```bash
kubectl get pods -n kube-system | grep coredns
```

### Issue: Connection refused to databases

**Solution:** 
1. Verify services exist: `kubectl get svc -n pg` and `kubectl get svc -n redis`
2. Check endpoints: `kubectl get endpoints -n pg` and `kubectl get endpoints -n redis`
3. Test from a debug pod in the same namespace

## Next Steps

1. Review logs: `kubectl logs -f deployment/mcp-server -n search-infrastructure`
2. Set up monitoring and alerts
3. Configure autoscaling (HPA)
4. Set up backups
5. Review security policies

## Reference

- Full deployment plan: `k8s/DEPLOYMENT_PLAN.md`
- Connection strings: See DEPLOYMENT_PLAN.md Section 10



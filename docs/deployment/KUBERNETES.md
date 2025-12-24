# Kubernetes Deployment - Search Infrastructure

This directory contains Kubernetes manifests and documentation for deploying the search infrastructure services (MCP Server, Crawl4AI, SearXNG) on the existing cluster infrastructure.

## 📋 Overview

The search infrastructure leverages:
- **PostgreSQL:** Existing CloudNativePG cluster (`pg-ceph`) in `pg` namespace
- **Redis:** Existing Redis Enterprise cluster (`redis-cluster`) with `mcp-database` in `redis` namespace
- **Storage:** Ceph RBD storage classes for persistent volumes
- **Ingress:** Kong ingress controller for external access

## 📁 Directory Structure

```
k8s/
├── README.md                          # This file
├── DEPLOYMENT_PLAN.md                 # Comprehensive deployment plan
├── QUICK_START.md                     # Step-by-step deployment guide
├── namespace.yaml                     # Namespace definition
│
├── configmaps/                        # Configuration maps
│   ├── app-config.yaml               # Application-wide config
│   └── searxng-config.yaml           # SearXNG configuration
│
├── secrets/                           # Secret templates
│   └── searxng-secret.yaml           # SearXNG secret template
│
├── deployments/                      # Deployment manifests
│   ├── mcp-server.yaml               # Current (needs update)
│   ├── mcp-server-updated.yaml.example  # Updated example
│   ├── crawl4ai.yaml                 # Current (needs update)
│   ├── crawl4ai-updated.yaml.example    # Updated example
│   ├── searxng.yaml                  # Current (needs update)
│   ├── searxng-updated.yaml.example     # Updated example
│   ├── redis.yaml                    # Standalone Redis (optional)
│   └── mcp-server-hpa.yaml           # Horizontal Pod Autoscaler
│
├── services/                          # Service definitions
│   ├── mcp-server.yaml
│   ├── crawl4ai.yaml
│   ├── searxng.yaml
│   └── redis.yaml
│
├── ingress/                           # Ingress configuration
│   └── ingress.yaml
│
└── storage/                           # Storage definitions
    └── redis-pvc.yaml                 # PVC for standalone Redis (optional)
```

## 🚀 Quick Start

1. **Read the deployment plan:**
   ```bash
   cat k8s/DEPLOYMENT_PLAN.md
   ```

2. **Follow the quick start guide:**
   ```bash
   cat k8s/QUICK_START.md
   ```

3. **Deploy:**
   ```bash
   # Create namespace
   kubectl apply -f k8s/namespace.yaml
   
   # Create secrets and configmaps
   kubectl apply -f k8s/configmaps/
   # Create searxng-secret manually (see QUICK_START.md)
   
   # Update and deploy services
   # (Update image references in deployment files first)
   kubectl apply -f k8s/deployments/
   kubectl apply -f k8s/services/
   ```

## 🔑 Key Configuration Points

### PostgreSQL Connection

**Service Endpoints:**
- Primary (Read-Write): `pg-ceph-rw.pg.svc.cluster.local:5432`
- Replica (Read-Only): `pg-ceph-r.pg.svc.cluster.local:5432`
- External (via HAProxy): `192.168.0.212:5432`

**Secret:** `pg-ceph-app` in `pg` namespace
- Contains: `username`, `password`, `dbname`, `uri`, `host`, `port`

### Redis Connection

**Service Endpoints:**
- MCP Database: `mcp-database.redis.svc.cluster.local:10515`
- Redis Cluster: `redis-cluster.redis.svc.cluster.local:6379`

**Secret:** `redb-mcp-database` in `redis` namespace
- Contains: `password`, `port`, `service_name`

### Storage Classes

- **Database Storage:** `ceph-rbd-fastpool` (for PostgreSQL)
- **Application Storage:** `ceph-rbd-fast` (for Redis, if standalone)
- **Temporary Storage:** `emptyDir` (for Playwright cache)

## 📝 Important Notes

### Current vs. Updated Manifests

The current deployment files (`mcp-server.yaml`, `crawl4ai.yaml`, `searxng.yaml`) use placeholder configurations:
- Placeholder images: `your-registry.io/...`
- Simple Redis connection: `redis://redis:6379`
- No PostgreSQL connection

**Use the `*-updated.yaml.example` files as templates** and update them with:
1. Your actual Docker registry
2. Proper secret references
3. Correct service endpoints

### Cross-Namespace Secret Access

To access secrets from `pg` and `redis` namespaces, you may need to create RBAC resources. See `QUICK_START.md` for details.

### Standalone Redis vs. Existing Redis

**Recommendation:** Use the existing Redis Enterprise `mcp-database` instead of deploying standalone Redis. This:
- Reduces resource usage
- Leverages existing infrastructure
- Provides better performance and features

If you need standalone Redis, use `k8s/deployments/redis.yaml` and `k8s/storage/redis-pvc.yaml`.

## 🔍 Verification

After deployment, verify:

```bash
# Check pods
kubectl get pods -n search-infrastructure

# Check services
kubectl get svc -n search-infrastructure

# Check endpoints
kubectl get endpoints -n search-infrastructure

# Test connections (see QUICK_START.md)
```

## 📚 Documentation

- **DEPLOYMENT_PLAN.md:** Comprehensive plan with all details
- **QUICK_START.md:** Step-by-step deployment instructions
- **This README:** Overview and quick reference

## 🆘 Troubleshooting

Common issues and solutions are documented in:
- `QUICK_START.md` - Troubleshooting section
- `DEPLOYMENT_PLAN.md` - Section 11: Troubleshooting Guide

## 🔐 Security Considerations

1. **Secrets:** Never commit actual secrets to git
2. **RBAC:** Ensure proper permissions for cross-namespace access
3. **Network Policies:** Consider restricting pod-to-pod communication
4. **TLS:** Use TLS for database connections (configured in CNPG)
5. **Image Security:** Scan images for vulnerabilities before deployment

## 📊 Monitoring

After deployment, set up:
- Pod monitoring (Prometheus)
- Database connection monitoring
- Redis connection monitoring
- Application metrics
- Log aggregation

## 🔄 Updates and Maintenance

When updating deployments:
1. Review `DEPLOYMENT_PLAN.md` for any infrastructure changes
2. Test in a development namespace first
3. Update image tags (avoid `latest` in production)
4. Verify secret references are still valid
5. Check service endpoints haven't changed

---

**Last Updated:** 2025-12-19  
**Cluster:** K3s v1.33.4+k3s1  
**Status:** Ready for Deployment



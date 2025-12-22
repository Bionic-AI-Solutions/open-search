# Kubernetes Deployment Plan - Search Infrastructure

## Executive Summary

This document outlines the deployment strategy for the search infrastructure services (MCP Server, Crawl4AI, SearXNG) leveraging the existing PostgreSQL and Redis infrastructure in the Kubernetes cluster.

**Date:** 2025-12-19  
**Cluster:** K3s v1.33.4+k3s1  
**Nodes:** 6 nodes (1 control-plane, 5 workers including 1 GPU node)

---

## 1. Current Cluster Infrastructure Analysis

### 1.1 Cluster Overview

- **Control Plane:** cp1 (192.168.0.204:6443)
- **Worker Nodes:** gpu, node1, node2, node3, ubuntu
- **Storage Classes Available:**
  - `ceph-rbd-fast` (RWO, Retain) - Primary for databases
  - `ceph-rbd-fastpool` (RWO, Retain) - For PostgreSQL cluster
  - `ceph-rbd-standard` (RWO, Retain)
  - `local-ssd` (RWO, Delete) - Default for local storage
  - `nfs-client` (RWO, Delete) - Default for NFS

### 1.2 Namespace Structure

- **Target Namespace:** `search-infrastructure` (needs to be created)
- **PostgreSQL Namespace:** `pg`
- **Redis Namespace:** `redis`
- **Ingress Controller:** Kong (primary), Nginx (secondary)

---

## 2. PostgreSQL Infrastructure (CloudNativePG)

### 2.1 Cluster Details

- **Cluster Name:** `pg-ceph`
- **Namespace:** `pg`
- **PostgreSQL Version:** 17.2
- **Instances:** 2 (pg-ceph-5, pg-ceph-6)
- **Primary:** pg-ceph-6
- **Status:** Healthy
- **Storage:** 20Gi per instance (ceph-rbd-fastpool)
- **Resources:**
  - Requests: 1 CPU, 2Gi memory
  - Limits: 2 CPU, 4Gi memory

### 2.2 Connection Services

#### Primary (Read-Write) Service

- **Service:** `pg-haproxy-primary.pg.svc.cluster.local`
- **Type:** LoadBalancer
- **External IP:** 192.168.0.212
- **Port:** 5432
- **NodePort:** 31047
- **Backend:** HAProxy → `pg-ceph-rw.pg.svc.cluster.local:5432`

#### Replica (Read-Only) Service

- **Service:** `pg-haproxy-replicas.pg.svc.cluster.local`
- **Type:** LoadBalancer
- **External IP:** 192.168.0.214
- **Port:** 5433
- **NodePort:** 30732
- **Backend:** HAProxy → `pg-ceph-r.pg.svc.cluster.local:5432` and `pg-ceph-ro.pg.svc.cluster.local:5432`

#### Direct Cluster Services (Internal)

- **Read-Write:** `pg-ceph-rw.pg.svc.cluster.local:5432`
- **Read-Only (Replica):** `pg-ceph-r.pg.svc.cluster.local:5432`
- **Read-Only (Standby):** `pg-ceph-ro.pg.svc.cluster.local:5432`

### 2.3 Authentication Secrets

#### Application Secret

- **Secret Name:** `pg-ceph-app` (namespace: `pg`)
- **Type:** `kubernetes.io/basic-auth`
- **Keys:**
  - `username` - Application username
  - `password` - Application password
  - `dbname` - Database name
  - `host` - Hostname
  - `port` - Port number
  - `uri` - Full connection URI
  - `jdbc-uri` - JDBC connection string
  - `pgpass` - PostgreSQL password file format

#### Bootstrap Secret

- **Secret Name:** `pg-credentials` (namespace: `pg`)
- **Type:** `kubernetes.io/basic-auth`
- **Keys:**
  - `username` - Superuser/owner username
  - `password` - Superuser password

### 2.4 Connection Pattern for New Deployments

**Recommended Approach:**

1. **For Internal Services:** Use direct cluster services (`pg-ceph-rw.pg.svc.cluster.local`)
2. **For External Access:** Use HAProxy LoadBalancer services
3. **For Read-Heavy Workloads:** Use replica services for read operations
4. **Secret Reference:** Reference `pg-ceph-app` secret from `pg` namespace

**Connection String Format:**

```
postgresql://<username>:<password>@pg-ceph-rw.pg.svc.cluster.local:5432/<dbname>
```

**Environment Variables Pattern:**

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: pg-ceph-app
        namespace: pg
        key: uri
  - name: DB_HOST
    value: "pg-ceph-rw.pg.svc.cluster.local"
  - name: DB_PORT
    value: "5432"
  - name: DB_NAME
    valueFrom:
      secretKeyRef:
        name: pg-ceph-app
        namespace: pg
        key: dbname
  - name: DB_USER
    valueFrom:
      secretKeyRef:
        name: pg-ceph-app
        namespace: pg
        key: username
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: pg-ceph-app
        namespace: pg
        key: password
```

### 2.5 Database Creation

**Option 1: Using CNPG Database Resource**

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Database
metadata:
  name: search-analytics
  namespace: pg
spec:
  cluster:
    name: pg-ceph
  owner: app
  encoding: UTF8
  localeCollate: C
  localeCType: C
```

**Option 2: Manual Creation via psql**

- Connect using credentials from `pg-ceph-app` secret
- Create database: `CREATE DATABASE search_analytics OWNER app;`

---

## 3. Redis Infrastructure (Redis Enterprise)

### 3.1 Cluster Details

- **Cluster Name:** `redis-cluster`
- **Namespace:** `redis`
- **Type:** Redis Enterprise Cluster
- **Pods:** 3 (redis-cluster-ceph-0, redis-cluster-ceph-1, redis-cluster-ceph-2)
- **Status:** Running
- **Storage:** 10Gi per pod (ceph-rbd-fast)
- **Version:** 7.4.3

### 3.2 Database Instance

- **Database Name:** `mcp-database`
- **Namespace:** `redis`
- **REDB Resource:** `mcp-database`
- **Port:** 10515
- **Memory:** 1GB
- **Persistence:** AOF Every Second
- **Replication:** Enabled
- **Shards:** 1 active, 1 inactive

### 3.3 Connection Service

- **Service:** `redis-cluster.redis.svc.cluster.local`
- **Type:** ClusterIP (headless)
- **Ports:**
  - `client`: 6379/TCP
  - `gossip`: 16379/TCP
- **Endpoints:** 3 pods (10.42.6.18, 10.42.0.247, 10.42.9.221)

### 3.4 Database-Specific Service

- **Service:** `mcp-database.redis.svc.cluster.local`
- **Type:** ClusterIP
- **Port:** 10515
- **Internal Endpoint:** `redis-10515.redis-cluster.redis.svc.cluster.local:10515`

### 3.5 Authentication Secrets

#### Database Secret

- **Secret Name:** `redb-mcp-database` (namespace: `redis`)
- **Type:** `Opaque`
- **Keys:**
  - `password` - Database password
  - `port` - Database port (10515)
  - `service_name` - Service name
  - `service_names` - Service names (comma-separated)

### 3.6 Connection Pattern for New Deployments

**Recommended Approach:**

1. **For MCP Database:** Use `mcp-database.redis.svc.cluster.local:10515`
2. **For General Redis:** Use `redis-cluster.redis.svc.cluster.local:6379`
3. **Secret Reference:** Reference `redb-mcp-database` secret from `redis` namespace

**Connection String Format:**

```
redis://:<password>@mcp-database.redis.svc.cluster.local:10515
```

**Environment Variables Pattern:**

```yaml
env:
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: redb-mcp-database
        namespace: redis
        key: password
    # Note: Construct full URL or use separate variables
  - name: REDIS_HOST
    value: "mcp-database.redis.svc.cluster.local"
  - name: REDIS_PORT
    valueFrom:
      secretKeyRef:
        name: redb-mcp-database
        namespace: redis
        key: port
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: redb-mcp-database
        namespace: redis
        key: password
```

**Alternative: Simple Redis (if not using MCP database)**

```yaml
env:
  - name: REDIS_HOST
    value: "redis-cluster.redis.svc.cluster.local"
  - name: REDIS_PORT
    value: "6379"
```

---

## 4. Deployment Strategy for Search Infrastructure

### 4.1 Namespace Setup

**Create namespace:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: search-infrastructure
  labels:
    name: search-infrastructure
    environment: production
```

### 4.2 Service Dependencies

**Order of Deployment:**

1. Namespace
2. ConfigMaps (if needed)
3. Secrets (reference existing or create new)
4. PersistentVolumeClaims (for Redis if standalone)
5. Redis (if using standalone, otherwise skip)
6. SearXNG
7. Crawl4AI
8. MCP Server
9. Services
10. Ingress

### 4.3 Storage Strategy

**For Redis (if standalone):**

- Use `ceph-rbd-fast` storage class (consistent with existing Redis)
- Size: 10Gi (matching existing Redis instances)
- Access Mode: ReadWriteOnce

**For PostgreSQL:**

- No PVC needed (using existing cluster)
- Connect via service endpoints

**For Application Data:**

- Use `ceph-rbd-fast` for persistent data
- Use `emptyDir` for temporary/cache data

### 4.4 Resource Requirements

Based on existing deployments:

- **Redis:** 256Mi-512Mi memory, 250m-500m CPU
- **SearXNG:** 512Mi-1Gi memory, 500m-1000m CPU
- **Crawl4AI:** 1Gi-2Gi memory, 500m-1000m CPU (Playwright overhead)
- **MCP Server:** 256Mi-512Mi memory, 250m-500m CPU

### 4.5 Network Policies

**Considerations:**

- Allow egress to `pg` namespace for PostgreSQL
- Allow egress to `redis` namespace for Redis
- Allow ingress from ingress controllers
- Restrict unnecessary inter-pod communication

---

## 5. Configuration Updates Required

### 5.1 MCP Server Deployment

**Current Configuration Issues:**

- Uses placeholder image: `your-registry.io/mcp-search-server:latest`
- Uses simple Redis connection: `redis://redis:6379`
- No PostgreSQL connection configured

**Required Updates:**

1. Update image to actual registry
2. Update Redis connection to use `mcp-database.redis.svc.cluster.local:10515`
3. Add PostgreSQL connection using `pg-ceph-app` secret
4. Update environment variables to reference secrets

### 5.2 Crawl4AI Deployment

**Current Configuration Issues:**

- Uses placeholder image: `your-registry.io/crawl4ai-service:latest`
- Uses simple Redis: `redis:6379`
- No PostgreSQL connection

**Required Updates:**

1. Update image to actual registry
2. Update Redis to use existing cluster or MCP database
3. Add PostgreSQL connection if needed for analytics

### 5.3 Redis Deployment (Standalone)

**Decision Required:**

- **Option A:** Use existing Redis Enterprise `mcp-database` (recommended)
- **Option B:** Deploy standalone Redis in `search-infrastructure` namespace

**Recommendation:** Use Option A to avoid resource duplication and leverage existing infrastructure.

### 5.4 SearXNG Deployment

**Configuration Needed:**

- ConfigMap for SearXNG settings
- Secret for SearXNG secret key
- Service configuration
- Ingress configuration (if needed)

---

## 6. Secrets Management

### 6.1 Existing Secrets to Reference

**From `pg` namespace:**

- `pg-ceph-app` - PostgreSQL application credentials
- `pg-credentials` - PostgreSQL superuser credentials (if needed)

**From `redis` namespace:**

- `redb-mcp-database` - Redis Enterprise database credentials

### 6.2 New Secrets to Create

**In `search-infrastructure` namespace:**

- `searxng-secret` - SearXNG secret key
- `search-app-secrets` - Application-specific secrets (if any)

**Secret Creation Example:**

```bash
# Generate SearXNG secret
SEARXNG_SECRET=$(openssl rand -hex 32)

# Create secret
kubectl create secret generic searxng-secret \
  --from-literal=secret=$SEARXNG_SECRET \
  -n search-infrastructure
```

### 6.3 Secret Reference Pattern

```yaml
# Reference secret from same namespace
env:
- name: SEARXNG_SECRET
  valueFrom:
    secretKeyRef:
      name: searxng-secret
      key: secret

# Reference secret from different namespace (requires RBAC)
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: pg-ceph-app
      namespace: pg
      key: password
```

**Note:** Cross-namespace secret access requires proper RBAC permissions.

---

## 7. Ingress Configuration

### 7.1 Current Ingress Setup

**Ingress Controllers:**

- **Kong:** Primary (used by most services)
- **Nginx:** Secondary (available)

**Current Ingress Pattern:**

- Services use Kong ingress with TLS
- Domain pattern: `*.bionicaisolutions.com`
- Cert-manager for TLS certificates

### 7.2 Recommended Ingress for Search Infrastructure

**Option 1: Kong Ingress (Recommended)**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: search-infrastructure-ingress
  namespace: search-infrastructure
  annotations:
    konghq.com/strip-path: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: kong
  tls:
    - hosts:
        - search.bionicaisolutions.com
        - mcp.bionicaisolutions.com
      secretName: search-tls
  rules:
    - host: search.bionicaisolutions.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mcp-server
                port:
                  number: 3000
```

**Option 2: Nginx Ingress**

- Use if Kong is not preferred
- Similar configuration with nginx annotations

---

## 8. Monitoring and Health Checks

### 8.1 Health Check Endpoints

**Required Endpoints:**

- `/health` - Liveness probe
- `/ready` - Readiness probe
- `/metrics` - Prometheus metrics (if applicable)

### 8.2 Probe Configuration

**Example:**

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### 8.3 Database Connection Health

**Include in health checks:**

- PostgreSQL connection status
- Redis connection status
- External service availability (SearXNG, Crawl4AI)

---

## 9. Deployment Checklist

### 9.1 Pre-Deployment

- [ ] Verify cluster access and permissions
- [ ] Verify PostgreSQL cluster is healthy
- [ ] Verify Redis cluster is healthy
- [ ] Check available resources (CPU, memory, storage)
- [ ] Verify storage classes are available
- [ ] Review network policies
- [ ] Prepare Docker images and push to registry

### 9.2 Secrets and ConfigMaps

- [ ] Create `search-infrastructure` namespace
- [ ] Create SearXNG secret
- [ ] Verify access to `pg-ceph-app` secret from `pg` namespace
- [ ] Verify access to `redb-mcp-database` secret from `redis` namespace
- [ ] Create ConfigMaps for SearXNG configuration
- [ ] Create any application-specific secrets

### 9.3 Database Setup

- [ ] Create database in PostgreSQL cluster (if needed)
- [ ] Verify database connectivity from test pod
- [ ] Test Redis connectivity from test pod
- [ ] Verify credentials work correctly

### 9.4 Storage

- [ ] Create PVC for standalone Redis (if using)
- [ ] Verify PVC is bound
- [ ] Test storage access

### 9.5 Deployments

- [ ] Deploy Redis (if standalone) or skip
- [ ] Deploy SearXNG
- [ ] Deploy Crawl4AI
- [ ] Deploy MCP Server
- [ ] Verify all pods are running
- [ ] Check logs for errors

### 9.6 Services and Networking

- [ ] Create all services
- [ ] Verify service endpoints
- [ ] Test service connectivity
- [ ] Configure ingress
- [ ] Verify DNS resolution
- [ ] Test external access

### 9.7 Post-Deployment

- [ ] Run health checks
- [ ] Test all endpoints
- [ ] Verify database connections
- [ ] Test Redis caching
- [ ] Monitor resource usage
- [ ] Set up monitoring/alerts
- [ ] Document connection strings
- [ ] Update runbooks

---

## 10. Connection String Reference

### 10.1 PostgreSQL Connection Strings

**Internal (from search-infrastructure namespace):**

```
postgresql://<user>:<password>@pg-ceph-rw.pg.svc.cluster.local:5432/<dbname>
```

**Via HAProxy (external access):**

```
postgresql://<user>:<password>@192.168.0.212:5432/<dbname>
```

**Using Secret:**

```bash
# Get connection string from secret
kubectl get secret pg-ceph-app -n pg -o jsonpath='{.data.uri}' | base64 -d
```

### 10.2 Redis Connection Strings

**MCP Database (recommended):**

```
redis://:<password>@mcp-database.redis.svc.cluster.local:10515
```

**General Redis Cluster:**

```
redis://redis-cluster.redis.svc.cluster.local:6379
```

**Using Secret:**

```bash
# Get password from secret
kubectl get secret redb-mcp-database -n redis -o jsonpath='{.data.password}' | base64 -d
```

---

## 11. Troubleshooting Guide

### 11.1 Common Issues

**Database Connection Failures:**

- Verify secret exists and is accessible
- Check network policies allow egress to `pg` namespace
- Verify service DNS resolution
- Test connection from debug pod

**Redis Connection Failures:**

- Verify Redis Enterprise database is active
- Check service endpoints are populated
- Verify password from secret
- Test connection from debug pod

**Pod Startup Issues:**

- Check resource limits vs requests
- Verify storage is available
- Check image pull secrets
- Review pod events and logs

### 11.2 Debug Commands

```bash
# Test PostgreSQL connection
kubectl run -it --rm debug --image=postgres:15-alpine --restart=Never -- \
  psql "postgresql://<user>:<password>@pg-ceph-rw.pg.svc.cluster.local:5432/<dbname>"

# Test Redis connection
kubectl run -it --rm debug --image=redis:7-alpine --restart=Never -- \
  redis-cli -h mcp-database.redis.svc.cluster.local -p 10515 -a <password> ping

# Check service endpoints
kubectl get endpoints -n pg pg-ceph-rw
kubectl get endpoints -n redis mcp-database

# Check secrets
kubectl get secret pg-ceph-app -n pg -o yaml
kubectl get secret redb-mcp-database -n redis -o yaml
```

---

## 12. Next Steps

1. **Review and Approve Plan**

   - Review this document with team
   - Get approval for using existing infrastructure
   - Confirm database names and credentials

2. **Prepare Deployment Manifests**

   - Update all deployment YAMLs with correct configurations
   - Add secret references
   - Update image references
   - Configure health checks

3. **Create Secrets and ConfigMaps**

   - Generate required secrets
   - Create ConfigMaps
   - Verify cross-namespace access

4. **Deploy Infrastructure**

   - Follow deployment checklist
   - Deploy in order
   - Verify each step

5. **Testing and Validation**

   - Run integration tests
   - Verify all connections
   - Test end-to-end workflows

6. **Documentation**
   - Update runbooks
   - Document connection strings
   - Create troubleshooting guides

---

## Appendix A: Quick Reference

### Service Endpoints

- **PostgreSQL Primary:** `pg-ceph-rw.pg.svc.cluster.local:5432`
- **PostgreSQL Replica:** `pg-ceph-r.pg.svc.cluster.local:5432`
- **PostgreSQL External:** `192.168.0.212:5432` (via HAProxy)
- **Redis MCP Database:** `mcp-database.redis.svc.cluster.local:10515`
- **Redis Cluster:** `redis-cluster.redis.svc.cluster.local:6379`

### Secrets

- **PostgreSQL App:** `pg-ceph-app` (namespace: `pg`)
- **PostgreSQL Credentials:** `pg-credentials` (namespace: `pg`)
- **Redis MCP Database:** `redb-mcp-database` (namespace: `redis`)

### Storage Classes

- **Database Storage:** `ceph-rbd-fastpool`
- **Application Storage:** `ceph-rbd-fast`
- **Temporary Storage:** `local-ssd` or `emptyDir`

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-19  
**Author:** AI Assistant  
**Status:** Draft - Pending Review

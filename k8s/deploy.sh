#!/bin/bash
# Deployment script for search-infrastructure
# This script deploys all resources in the correct order

set -e

NAMESPACE="search-infrastructure"
K8S_DIR="/workspace/k8s"

echo "=========================================="
echo "Deploying Search Infrastructure"
echo "=========================================="

# Step 1: Create namespace
echo ""
echo "Step 1: Creating namespace..."
kubectl apply -f ${K8S_DIR}/namespace.yaml
kubectl wait --for=condition=Active namespace/${NAMESPACE} --timeout=30s || true

# Step 2: Create RBAC (needed before secrets can be accessed)
echo ""
echo "Step 2: Creating RBAC for cross-namespace secret access..."
kubectl apply -f ${K8S_DIR}/rbac/secret-reader-rbac.yaml

# Step 3: Create secrets
echo ""
echo "Step 3: Creating secrets..."
# Docker registry secret
kubectl apply -f ${K8S_DIR}/secrets/docker-registry-secret.yaml

# SearXNG secret (generate if not exists)
if ! kubectl get secret searxng-secret -n ${NAMESPACE} &>/dev/null; then
    echo "Creating SearXNG secret..."
    SEARXNG_SECRET=$(openssl rand -hex 32)
    kubectl create secret generic searxng-secret \
        --from-literal=secret=${SEARXNG_SECRET} \
        -n ${NAMESPACE}
else
    echo "SearXNG secret already exists, skipping..."
fi

# Copy secrets from other namespaces (required for cross-namespace access)
echo "Copying secrets from other namespaces..."
if [ -f "${K8S_DIR}/secrets/redb-mcp-database.yaml" ]; then
    kubectl apply -f ${K8S_DIR}/secrets/redb-mcp-database.yaml
else
    echo "WARNING: redb-mcp-database.yaml not found. Creating from redis namespace..."
    kubectl get secret redb-mcp-database -n redis -o json | \
        jq '{apiVersion: "v1", kind: "Secret", metadata: {name: "redb-mcp-database", namespace: "'${NAMESPACE}'"}, type: .type, data: .data}' | \
        kubectl apply -f -
fi

if [ -f "${K8S_DIR}/secrets/pg-ceph-app.yaml" ]; then
    kubectl apply -f ${K8S_DIR}/secrets/pg-ceph-app.yaml
else
    echo "WARNING: pg-ceph-app.yaml not found. Creating from pg namespace..."
    kubectl get secret pg-ceph-app -n pg -o json | \
        jq '{apiVersion: "v1", kind: "Secret", metadata: {name: "pg-ceph-app", namespace: "'${NAMESPACE}'"}, type: .type, data: .data}' | \
        kubectl apply -f -
fi

# Step 4: Create ConfigMaps
echo ""
echo "Step 4: Creating ConfigMaps..."
kubectl apply -f ${K8S_DIR}/configmaps/app-config.yaml
kubectl apply -f ${K8S_DIR}/configmaps/searxng-config.yaml

# Step 5: Create Services
echo ""
echo "Step 5: Creating Services..."
kubectl apply -f ${K8S_DIR}/services/searxng.yaml
kubectl apply -f ${K8S_DIR}/services/crawl4ai.yaml
kubectl apply -f ${K8S_DIR}/services/mcp-server.yaml

# Step 6: Create Deployments
echo ""
echo "Step 6: Creating Deployments..."
kubectl apply -f ${K8S_DIR}/deployments/searxng.yaml
kubectl apply -f ${K8S_DIR}/deployments/crawl4ai.yaml
kubectl apply -f ${K8S_DIR}/deployments/mcp-server.yaml

# Step 7: Create HPA (optional)
echo ""
echo "Step 7: Creating HPA..."
kubectl apply -f ${K8S_DIR}/deployments/mcp-server-hpa.yaml || echo "HPA already exists or failed"

# Step 8: Create Ingress (optional)
echo ""
echo "Step 8: Creating Ingress..."
kubectl apply -f ${K8S_DIR}/ingress/ingress.yaml || echo "Ingress already exists or failed"

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=searxng -n ${NAMESPACE} --timeout=120s || true
kubectl wait --for=condition=ready pod -l app=crawl4ai -n ${NAMESPACE} --timeout=120s || true
kubectl wait --for=condition=ready pod -l app=mcp-server -n ${NAMESPACE} --timeout=120s || true

echo ""
echo "Current pod status:"
kubectl get pods -n ${NAMESPACE}


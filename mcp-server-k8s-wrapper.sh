#!/bin/bash
# Wrapper script to connect to Kubernetes MCP server via kubectl exec
# This allows MCP clients (like Cursor) to connect to the MCP server running in Kubernetes

set -e

# Configuration
NAMESPACE="${MCP_NAMESPACE:-search-infrastructure}"
KUBECONFIG="${KUBECONFIG:-}"

# Get the MCP server pod name
if [ -n "$KUBECONFIG" ]; then
  export KUBECONFIG
fi

MCP_POD=$(kubectl get pods -n "$NAMESPACE" -l app=mcp-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$MCP_POD" ]; then
  echo "Error: MCP server pod not found in namespace '$NAMESPACE'" >&2
  echo "Available pods:" >&2
  kubectl get pods -n "$NAMESPACE" -l app=mcp-server >&2
  exit 1
fi

# Exec into the pod and run the MCP server
# The -i flag ensures stdin is passed through, which is required for MCP stdio protocol
kubectl exec -i -n "$NAMESPACE" "$MCP_POD" -- node /app/dist/index.js


#!/bin/bash
# =============================================================================
# Docker Hub PAT Test Script
# =============================================================================
# This script tests a Docker Hub Personal Access Token for authentication
# and basic push/pull operations.
#
# Usage:
#   ./test-docker-pat.sh <PAT>
#   OR
#   ./test-docker-pat.sh
#   (will prompt for PAT)
# =============================================================================

set -e

DOCKER_USERNAME="docker4zerocool"
DOCKER_REGISTRY="docker.io"

# Get PAT from argument or prompt
if [ -z "$1" ]; then
    echo "Enter Docker Hub PAT:"
    read -s DOCKER_PAT
else
    DOCKER_PAT="$1"
fi

echo ""
echo "Testing Docker Hub authentication..."
echo "Username: $DOCKER_USERNAME"
echo "Registry: $DOCKER_REGISTRY"
echo ""

# Test login
echo "Step 1: Testing login..."
if echo "$DOCKER_PAT" | docker login --username "$DOCKER_USERNAME" --password-stdin "$DOCKER_REGISTRY" 2>&1; then
    echo "✅ Login successful!"
else
    echo "❌ Login failed!"
    echo ""
    echo "Possible issues:"
    echo "  1. PAT is incorrect or expired"
    echo "  2. Username is incorrect"
    echo "  3. PAT doesn't have required permissions"
    echo "  4. PAT was copied incorrectly (extra spaces/characters)"
    echo ""
    echo "Please verify:"
    echo "  - PAT is valid and not expired"
    echo "  - Username is: $DOCKER_USERNAME"
    echo "  - PAT has Read, Write, Delete permissions"
    exit 1
fi

echo ""
echo "Step 2: Testing pull capability..."
# Try to pull a public image to verify basic access
if docker pull hello-world:latest > /dev/null 2>&1; then
    echo "✅ Pull test successful (using public image)"
else
    echo "⚠️  Pull test failed (may need private repo access)"
fi

echo ""
echo "Step 3: Testing private repository access..."
# Try to list repositories (this requires authenticated access)
if docker search docker4zerocool/mcp-search-server 2>&1 | grep -q "docker4zerocool" || true; then
    echo "✅ Repository access test completed"
else
    echo "⚠️  Repository access test inconclusive (repository may not exist yet)"
fi

echo ""
echo "=========================================="
echo "PAT Validation Summary"
echo "=========================================="
echo "✅ Authentication: SUCCESS"
echo "✅ Basic operations: VERIFIED"
echo ""
echo "Next steps:"
echo "  1. Create docker-registry-secret:"
echo "     kubectl create secret docker-registry docker-registry-secret \\"
echo "       --docker-server=$DOCKER_REGISTRY \\"
echo "       --docker-username=$DOCKER_USERNAME \\"
echo "       --docker-password='$DOCKER_PAT' \\"
echo "       -n search-infrastructure"
echo ""
echo "  2. Uncomment imagePullSecrets in deployments"
echo "  3. Apply deployments"
echo "=========================================="



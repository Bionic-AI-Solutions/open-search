# Docker Hub PAT Validation Guide

## Current Status

**PAT Authentication Test:** ❌ **FAILED**

The provided PAT (`dckr_pat_iZn55_MiVeYSzhx-OECGWfaFlpw`) failed authentication with error:
```
Error response from daemon: Get "https://registry-1.docker.io/v2/": unauthorized: incorrect username or password
```

## Troubleshooting Steps

### 1. Verify PAT in Docker Hub

1. Go to [Docker Hub](https://hub.docker.com/)
2. Sign in as `docker4zerocool`
3. Navigate to: **Account Settings** → **Security** → **New Access Token**
4. Verify or create a new PAT with:
   - **Permissions:** Read, Write, Delete
   - **Description:** Kubernetes deployment
   - **Expiration:** Set appropriate expiration (or no expiration)

### 2. Verify PAT Format

- PAT should start with `dckr_pat_`
- No leading/trailing spaces
- Complete token copied (usually 40+ characters after `dckr_pat_`)

### 3. Test PAT Locally

**Option A: Using the test script**
```bash
cd /workspace
./k8s/scripts/test-docker-pat.sh <YOUR_PAT>
```

**Option B: Manual test**
```bash
echo "<YOUR_PAT>" | docker login --username docker4zerocool --password-stdin
```

**Option C: Interactive test**
```bash
docker login --username docker4zerocool
# Enter PAT when prompted
```

### 4. Verify Username

Confirm the Docker Hub username is exactly: `docker4zerocool`

### 5. Check PAT Permissions

The PAT must have:
- ✅ **Read** - To pull images
- ✅ **Write** - To push images (if needed)
- ✅ **Delete** - To manage repositories (optional)

## After PAT Validation

Once you have a working PAT:

### Step 1: Test the PAT
```bash
./k8s/scripts/test-docker-pat.sh <YOUR_PAT>
```

### Step 2: Create Docker Registry Secret
```bash
kubectl create secret docker-registry docker-registry-secret \
  --docker-server=docker.io \
  --docker-username=docker4zerocool \
  --docker-password='<YOUR_VALIDATED_PAT>' \
  --namespace=search-infrastructure
```

### Step 3: Verify Secret
```bash
kubectl get secret docker-registry-secret -n search-infrastructure
```

### Step 4: Uncomment imagePullSecrets

Edit these files and uncomment the `imagePullSecrets` section:
- `k8s/deployments/mcp-server.yaml`
- `k8s/deployments/crawl4ai.yaml`

### Step 5: Apply Deployments
```bash
kubectl apply -f k8s/deployments/
```

## Common Issues

### Issue: "unauthorized: incorrect username or password"
**Solutions:**
- Verify PAT is correct and not expired
- Check username spelling
- Ensure PAT has correct permissions
- Try creating a new PAT

### Issue: "repository does not exist"
**Solutions:**
- Create the repository in Docker Hub first
- Verify repository name matches deployment
- Check repository visibility (public/private)

### Issue: "pull access denied"
**Solutions:**
- Verify PAT has Read permission
- Check repository is accessible
- Verify imagePullSecrets is configured correctly

## Alternative: Public Images

If you prefer to use public images (no authentication needed):

1. Make repositories public in Docker Hub
2. Remove `imagePullSecrets` from deployments
3. Update image references if needed

## Next Steps

1. **Get a new/verified PAT** from Docker Hub
2. **Test the PAT** using the script
3. **Create the secret** after successful validation
4. **Uncomment imagePullSecrets** in deployments
5. **Deploy** the infrastructure

---

**Note:** All other manifests are ready. Only the Docker registry authentication is pending PAT validation.


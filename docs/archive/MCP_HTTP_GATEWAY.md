# MCP HTTP Gateway Implementation Guide

## Overview

This guide explains how to implement an HTTP gateway service that translates HTTP requests to MCP stdio protocol, enabling remote MCP clients to connect to your Kubernetes-deployed MCP server.

## 🏗️ Architecture

```
Remote MCP Client
    ↓ HTTP POST /mcp/call
HTTP Gateway Service
    ↓ kubectl exec (stdio)
MCP Server Pod
    ↓ stdio protocol
MCP Server Process
```

## 📦 Implementation

### Option 1: Node.js HTTP Gateway (Recommended)

A Node.js service that:
- Accepts HTTP POST requests with MCP protocol messages
- Spawns MCP server process via kubectl exec
- Translates HTTP requests to stdio and vice versa
- Handles WebSocket upgrades for streaming (optional)

### Option 2: Python HTTP Gateway

A Python FastAPI service with similar functionality.

## 🚀 Quick Start

### Step 1: Create HTTP Gateway Service

**File:** `mcp-http-gateway/src/index.ts`

```typescript
import express from 'express';
import { spawn } from 'child_process';
import { Server as WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-http-gateway' });
});

// MCP protocol endpoint
app.post('/mcp/call', async (req, res) => {
  const { method, params, id } = req.body;
  
  try {
    // Spawn MCP server process via kubectl exec
    const mcpProcess = spawn('kubectl', [
      'exec', '-i',
      '-n', process.env.MCP_NAMESPACE || 'search-infrastructure',
      process.env.MCP_POD_NAME || await getMcpPodName(),
      '--',
      'node', '/app/dist/index.js'
    ], {
      env: {
        ...process.env,
        // Pass through MCP server environment variables
        SEARXNG_URL: process.env.SEARXNG_URL,
        CRAWL4AI_URL: process.env.CRAWL4AI_URL,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      }
    });

    // Send MCP request via stdin
    const mcpRequest = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    }) + '\n';

    mcpProcess.stdin.write(mcpRequest);
    mcpProcess.stdin.end();

    // Collect response from stdout
    let responseData = '';
    mcpProcess.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({
          error: 'MCP server process exited with error',
          code
        });
      }

      try {
        const response = JSON.parse(responseData);
        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to parse MCP response',
          details: error.message
        });
      }
    });

    // Timeout handling
    setTimeout(() => {
      if (!res.headersSent) {
        mcpProcess.kill();
        res.status(504).json({
          error: 'Request timeout',
          id
        });
      }
    }, 30000); // 30 second timeout

  } catch (error) {
    res.status(500).json({
      error: 'Failed to execute MCP request',
      details: error.message
    });
  }
});

// WebSocket endpoint for streaming (optional)
wss.on('connection', (ws) => {
  // Implement WebSocket MCP protocol handling
  // This allows for bidirectional streaming
});

async function getMcpPodName(): Promise<string> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const { stdout } = await execAsync(
    `kubectl get pods -n ${process.env.MCP_NAMESPACE || 'search-infrastructure'} -l app=mcp-server -o jsonpath='{.items[0].metadata.name}'`
  );
  
  return stdout.trim();
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`MCP HTTP Gateway listening on port ${PORT}`);
});
```

### Step 2: Create Dockerfile

**File:** `mcp-http-gateway/Dockerfile`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install kubectl
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### Step 3: Create Kubernetes Deployment

**File:** `k8s/deployments/mcp-http-gateway.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-http-gateway
  namespace: search-infrastructure
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-http-gateway
  template:
    metadata:
      labels:
        app: mcp-http-gateway
    spec:
      serviceAccountName: mcp-gateway-sa
      containers:
      - name: gateway
        image: docker4zerocool/mcp-http-gateway:latest
        ports:
        - containerPort: 8080
        env:
        - name: MCP_NAMESPACE
          value: "search-infrastructure"
        - name: PORT
          value: "8080"
        # Pass through MCP server environment variables
        - name: SEARXNG_URL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: SEARXNG_URL
        - name: CRAWL4AI_URL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: CRAWL4AI_URL
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: REDIS_HOST
        - name: REDIS_PORT
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: REDIS_PORT
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: redb-mcp-database
              key: password
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Step 4: Create Kubernetes Service

**File:** `k8s/services/mcp-http-gateway.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-http-gateway
  namespace: search-infrastructure
spec:
  selector:
    app: mcp-http-gateway
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
  # Or use ClusterIP with Ingress
```

### Step 5: Create Service Account with RBAC

**File:** `k8s/rbac/mcp-gateway-rbac.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mcp-gateway-sa
  namespace: search-infrastructure
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mcp-gateway-role
  namespace: search-infrastructure
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["pods/exec"]
  verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: mcp-gateway-rolebinding
  namespace: search-infrastructure
subjects:
- kind: ServiceAccount
  name: mcp-gateway-sa
  namespace: search-infrastructure
roleRef:
  kind: Role
  name: mcp-gateway-role
  apiGroup: rbac.authorization.k8s.io
```

### Step 6: Create Ingress (Optional)

**File:** `k8s/ingress/mcp-gateway-ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mcp-gateway-ingress
  namespace: search-infrastructure
  annotations:
    konghq.com/plugins: mcp-gateway-auth
spec:
  ingressClassName: kong
  rules:
  - host: mcp-gateway.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: mcp-http-gateway
            port:
              number: 80
```

## 🔐 Security Enhancements

### Add API Key Authentication

**File:** `mcp-http-gateway/src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Use in app:
app.use('/mcp', apiKeyAuth);
```

### Add Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/mcp', limiter);
```

## 📝 Usage Examples

### Using curl

```bash
# List available tools
curl -X POST https://mcp-gateway.yourdomain.com/mcp/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'

# Call web_search tool
curl -X POST https://mcp-gateway.yourdomain.com/mcp/call \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "latest AI news",
        "maxResults": 5
      }
    },
    "id": 2
  }'
```

### Using MCP Client Configuration

```json
{
  "mcpServers": {
    "open-search-remote": {
      "transport": "http",
      "url": "https://mcp-gateway.yourdomain.com/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

## 🧪 Testing

### Test Locally

```bash
# Build and run locally
cd mcp-http-gateway
npm install
npm run build
npm start

# Test health endpoint
curl http://localhost:8080/health

# Test MCP call
curl -X POST http://localhost:8080/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'
```

### Test in Kubernetes

```bash
# Deploy
kubectl apply -f k8s/rbac/mcp-gateway-rbac.yaml
kubectl apply -f k8s/deployments/mcp-http-gateway.yaml
kubectl apply -f k8s/services/mcp-http-gateway.yaml

# Check status
kubectl get pods -n search-infrastructure -l app=mcp-http-gateway
kubectl logs -n search-infrastructure -l app=mcp-http-gateway

# Test via port-forward
kubectl port-forward -n search-infrastructure svc/mcp-http-gateway 8080:80
curl http://localhost:8080/health
```

## 🐛 Troubleshooting

### Gateway can't exec into MCP pod

**Check RBAC:**
```bash
kubectl auth can-i create pods/exec \
  --namespace=search-infrastructure \
  --as=system:serviceaccount:search-infrastructure:mcp-gateway-sa
```

**Check service account:**
```bash
kubectl get sa mcp-gateway-sa -n search-infrastructure
kubectl describe rolebinding mcp-gateway-rolebinding -n search-infrastructure
```

### MCP protocol errors

**Check MCP server logs:**
```bash
kubectl logs -n search-infrastructure -l app=mcp-server --tail=50
```

**Verify environment variables:**
```bash
kubectl exec -n search-infrastructure -l app=mcp-http-gateway -- env | grep -E "SEARXNG|CRAWL4AI|REDIS"
```

## 📚 Additional Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Express.js Documentation](https://expressjs.com/)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

---

**Next Steps:**
1. Implement the HTTP gateway service
2. Deploy to Kubernetes
3. Configure Ingress for external access
4. Test with remote MCP client


# GitHub Repository Setup Instructions

## Repository Details

- **Organization**: Bionic-AI-Solutions
- **Repository Name**: `open-search`
- **Description**: Open-source search infrastructure with SearXNG, Crawl4AI, and MCP server integration. Production-ready Kubernetes deployment.
- **Visibility**: Public

## Option 1: Create via GitHub Web UI (Recommended)

1. Go to: https://github.com/organizations/Bionic-AI-Solutions/repositories/new

2. Fill in the form:
   - **Repository name**: `open-search`
   - **Description**: `Open-source search infrastructure with SearXNG, Crawl4AI, and MCP server integration. Production-ready Kubernetes deployment.`
   - **Visibility**: Public
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)

3. Click "Create repository"

4. After creation, run these commands:

```bash
cd /workspace
git remote add origin https://github.com/Bionic-AI-Solutions/open-search.git
git push -u origin main
```

## Option 2: Create via GitHub API

If you have a GitHub Personal Access Token (PAT) with `repo` scope:

```bash
export GITHUB_TOKEN=your_token_here
bash /tmp/create_repo.sh
```

Then push:

```bash
cd /workspace
git remote add origin https://github.com/Bionic-AI-Solutions/open-search.git
git push -u origin main
```

## Option 3: Use GitHub CLI (if installed)

```bash
gh repo create Bionic-AI-Solutions/open-search \
  --public \
  --description "Open-source search infrastructure with SearXNG, Crawl4AI, and MCP server integration. Production-ready Kubernetes deployment." \
  --source=. \
  --remote=origin \
  --push
```

## After Repository Creation

Once the repository is created and pushed, you can:

1. **Set up branch protection** (recommended):
   - Go to Settings → Branches
   - Add rule for `main` branch
   - Require pull request reviews
   - Require status checks to pass

2. **Note on CI/CD**:
   - CI/CD workflows are not included as the cluster is not internet-accessible
   - Docker images should be built and pushed manually from within the cluster network
   - Use the provided Dockerfiles and build scripts for local image creation

## Repository Structure

```
open-search/
├── k8s/                       # Kubernetes manifests
│   ├── deployments/          # Deployment configs
│   ├── services/             # Service definitions
│   ├── configmaps/           # Configuration maps
│   ├── secrets/               # Secret templates
│   └── deploy.sh             # Deployment script
├── mcp-server/               # MCP server implementation
├── crawl4ai-service/         # Crawl4AI service
├── searxng/                  # SearXNG configuration
├── docker-compose.yml        # Docker Compose setup
├── README.md                 # Main documentation
└── .gitignore                # Git ignore rules
```

## Next Steps

1. Create the repository using one of the methods above
2. Push the code
3. Review and merge any initial pull requests
4. Set up branch protection rules (optional)
5. Build and push Docker images manually within your cluster network
6. Start using the repository!


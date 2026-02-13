# Docker Runtime for Tmux Agents

This directory contains Docker configuration files for running agents in containers.

## Quick Start

### 1. Build the base image

```bash
cd docker
docker build -t tmux-agents-base:latest .
```

### 2. Build the GPU variant (optional)

```bash
docker build -f Dockerfile.gpu -t tmux-agents-base-gpu:latest .
```

### 3. Create the network

```bash
docker network create tmux-agents
```

### 4. Test the image

```bash
docker run -it --rm tmux-agents-base:latest tmux attach -t agent
```

## Image Variants

### `tmux-agents-base:latest`

- **Base:** `node:22-slim`
- **Size:** ~300MB
- **Includes:** tmux, git, curl, jq, Node.js 22
- **Use case:** General-purpose agents

### `tmux-agents-base-gpu:latest`

- **Base:** `nvidia/cuda:12.2.0-runtime-ubuntu22.04`
- **Size:** ~2GB
- **Includes:** Everything from base + CUDA 12.2 runtime
- **Use case:** Agents that need GPU acceleration

## Architecture

### Container Lifecycle

1. **Start:** Container launches with tmux session named `agent`
2. **Spawn:** DockerRuntime injects AI CLI command via `tmux send-keys`
3. **Run:** Agent executes tasks inside the container
4. **Stop:** Container is stopped and removed

### Mounted Volumes

- `/workspace` — Host working directory (read-write)
- `/root/.config/claude` — Claude CLI auth tokens (read-only)
- `/root/.config/gcloud` — Google Cloud SDK auth (read-only)
- `/root/.gitconfig` — Git configuration (read-only)
- `/root/.ssh` — SSH keys for git operations (read-only)

### Resource Limits

Default limits (configurable per agent):

- **Memory:** 4GB
- **CPUs:** 2.0

### Labels

All agent containers have these labels:

- `tmux-agents=true` — Identifies tmux-agents containers
- `tmux-agents.agent-id=<id>` — Unique agent identifier
- `tmux-agents.session-name=<name>` — Tmux session name
- `tmux-agents.ai-provider=<provider>` — AI provider (claude, gemini, etc.)
- `tmux-agents.created-at=<timestamp>` — Creation timestamp

## Network

All agent containers join the `tmux-agents` bridge network for inter-container communication.

## Reconciliation

The daemon reconciler can detect and reconnect to running containers after restart by querying Docker for containers with the `tmux-agents=true` label.

## Cleanup

Remove all agent containers:

```bash
docker ps -a --filter "label=tmux-agents=true" -q | xargs docker rm -f
```

Remove the network:

```bash
docker network rm tmux-agents
```

## Security

- Auth tokens are mounted read-only
- Containers run as root (required for tmux)
- No privileged mode
- No host networking

## Debugging

Attach to a running agent:

```bash
docker exec -it <container-id> tmux attach -t agent
```

View container logs:

```bash
docker logs <container-id>
```

Inspect container:

```bash
docker inspect <container-id>
```

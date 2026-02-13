# Agent Runtime System

This directory contains the pluggable runtime system for tmux-agents. Runtimes provide different execution backends for agents (local, Docker, Kubernetes, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      RuntimeManager                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Register, Route, Spawn, Kill, List, GetTmux         │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────┬──────────────┬──────────────┬───────────────┘
                │              │              │
       ┌────────▼───────┐  ┌──▼───────────┐  ┌▼──────────────┐
       │ LocalRuntime   │  │DockerRuntime │  │ K8sRuntime    │
       │ (SSH/tmux)     │  │ (Containers) │  │ (Pods)        │
       └────────────────┘  └──────────────┘  └───────────────┘
```

## Files

- **types.ts** — AgentRuntime interface, AgentConfig, AgentHandle, etc.
- **runtimeManager.ts** — Central registry and router
- **dockerRuntime.ts** — Docker container execution backend
- **index.ts** — Public exports

## AgentRuntime Interface

All runtime implementations must satisfy:

```typescript
interface AgentRuntime {
  type: string;
  spawnAgent(config: AgentConfig): Promise<AgentHandle>;
  killAgent(handle: AgentHandle): Promise<void>;
  listAgents(): Promise<AgentInfo[]>;
  getTmux(handle: AgentHandle): TmuxService;
  getAttachCommand(handle: AgentHandle): string;
  ping(): Promise<void>;
}
```

## Usage

### Basic Setup

```typescript
import { RuntimeManager, DockerRuntime } from './runtimes';

const manager = new RuntimeManager();

// Register Docker runtime
const dockerRuntime = new DockerRuntime({
  image: 'tmux-agents-base:latest',
  network: 'tmux-agents',
  defaultMemory: 4 * 1024 * 1024 * 1024,
  defaultCpus: 2.0
});

manager.register('docker-default', dockerRuntime);
```

### Spawn an Agent

```typescript
const config: AgentConfig = {
  agentId: 'agent-123',
  aiProvider: AIProvider.CLAUDE,
  task: 'Implement the user authentication module',
  workingDirectory: '/path/to/project',
  sessionName: 'agent',
  autoPilot: true,
  resources: {
    memory: 8 * 1024 * 1024 * 1024,  // 8GB
    cpus: 4.0
  }
};

const handle = await manager.spawnAgent('docker-default', config);
console.log(`Agent spawned: ${handle.agentId}`);
```

### Interact with Agent

```typescript
// Get TmuxService for the agent
const tmux = manager.getTmux(handle);

// Send commands
await tmux.sendKeys('agent', '0', '0', 'npm test');

// Capture output
const output = await tmux.capturePaneContent('agent', '0', '0', 100);

// Get attach command for VS Code terminal
const attachCmd = manager.getAttachCommand(handle);
// Returns: "docker exec -it <container-id> tmux attach -t agent"
```

### List and Kill Agents

```typescript
// List all agents across all runtimes
const agents = await manager.listAllAgents();

for (const agent of agents) {
  console.log(`${agent.handle.agentId}: ${agent.status}`);
}

// Kill an agent
await manager.killAgent(handle);
```

## Docker Runtime

### Features

- **Container Isolation** — Each agent runs in its own container
- **Resource Limits** — Memory and CPU limits enforced by Docker
- **Auth Token Mounting** — Automatically mounts Claude, Gemini, Git, SSH configs
- **Working Directory Bind** — Host directory mounted as `/workspace`
- **Network Isolation** — All containers join a bridge network
- **Reconciliation** — Reconnect to running containers after daemon restart
- **Label-based Discovery** — Containers tagged with `tmux-agents=true`

### Configuration

```typescript
const dockerRuntime = new DockerRuntime({
  socketPath: '/var/run/docker.sock',      // Docker socket
  image: 'tmux-agents-base:latest',        // Base image
  network: 'tmux-agents',                  // Docker network
  extraBinds: ['/data:/data:ro'],          // Additional mounts
  defaultMemory: 4 * 1024 * 1024 * 1024,   // 4GB default
  defaultCpus: 2.0                         // 2 CPUs default
});
```

### Auto-Mounted Auth Tokens

The Docker runtime automatically mounts these directories (if they exist):

- `~/.config/claude` → `/root/.config/claude` (read-only)
- `~/.config/gcloud` → `/root/.config/gcloud` (read-only)
- `~/.gitconfig` → `/root/.gitconfig` (read-only)
- `~/.ssh` → `/root/.ssh` (read-only)
- `~/.aider` → `/root/.aider` (read-only)

### Container Labels

All agent containers have these labels:

- `tmux-agents=true`
- `tmux-agents.agent-id=<id>`
- `tmux-agents.session-name=<name>`
- `tmux-agents.ai-provider=<provider>`
- `tmux-agents.created-at=<timestamp>`

### Lifecycle

1. **Create** — `docker.createContainer()` with labels and mounts
2. **Start** — `container.start()`
3. **Wait** — Poll tmux until session is ready
4. **Launch** — Send AI CLI command via `tmux send-keys`
5. **Run** — Agent executes tasks
6. **Stop** — `container.stop({ t: 10 })`
7. **Remove** — `container.remove()`

### TmuxService Integration

The Docker runtime creates a `TmuxService` with an `execPrefix`:

```typescript
const tmux = new TmuxService(
  { id: `docker:${containerId}`, label: 'Docker:abc123', isLocal: false },
  `docker exec ${containerId}`,  // execPrefix
  eventBus
);
```

All tmux commands are prefixed with `docker exec <container-id>`:

```bash
docker exec abc123 tmux list-sessions
docker exec abc123 tmux send-keys -t agent:0.0 "echo hello" Enter
docker exec abc123 tmux capture-pane -t agent:0.0 -p
```

## K8s Runtime (Future)

### Planned Features

- Pod-based agent execution
- Namespace isolation
- Resource quotas
- Persistent volumes for shared state
- Service discovery
- Horizontal scaling

### Interface

```typescript
const k8sRuntime = new K8sRuntime({
  context: 'my-cluster',
  namespace: 'tmux-agents',
  image: 'tmux-agents-base:latest',
  defaultMemory: '4Gi',
  defaultCpus: '2000m'
});

manager.register('k8s-default', k8sRuntime);
```

## Testing

### Unit Tests

```bash
npm run test -- src/runtimes/__tests__/runtimeManager.test.ts
npm run test -- src/runtimes/__tests__/dockerRuntime.test.ts
```

### Integration Tests

Requires Docker daemon:

```bash
cd docker && ./build.sh  # Build base image
npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts
```

See `docker/TEST_PLAN.md` for comprehensive test procedures.

## Development

### Adding a New Runtime

1. Create `src/runtimes/myRuntime.ts`
2. Implement `AgentRuntime` interface
3. Export from `src/runtimes/index.ts`
4. Add tests in `src/runtimes/__tests__/myRuntime.test.ts`

Example:

```typescript
export class MyRuntime implements AgentRuntime {
  readonly type = 'my-runtime';

  async spawnAgent(config: AgentConfig): Promise<AgentHandle> {
    // Spawn logic
    return {
      runtimeType: 'my-runtime',
      agentId: config.agentId,
      data: { /* runtime-specific data */ }
    };
  }

  async killAgent(handle: AgentHandle): Promise<void> {
    // Cleanup logic
  }

  async listAgents(): Promise<AgentInfo[]> {
    // Discovery logic
  }

  getTmux(handle: AgentHandle): TmuxService {
    // Return TmuxService with appropriate execPrefix
  }

  getAttachCommand(handle: AgentHandle): string {
    // Return command for VS Code terminal
  }

  async ping(): Promise<void> {
    // Health check
  }
}
```

## Troubleshooting

### Docker Daemon Not Running

```
Error: Docker daemon is not reachable
```

**Solution:** Start Docker Desktop or `systemd start docker`

### Image Not Found

```
Error: image not found: tmux-agents-base:latest
```

**Solution:** Build the image: `cd docker && ./build.sh`

### Permission Denied on Auth Tokens

```
Error: Failed to mount /root/.config/claude
```

**Solution:** Ensure host directories are readable and exist

### Container Stuck in "Starting"

```
Error: Tmux session did not become ready
```

**Solution:** Check container logs: `docker logs <container-id>`

### Network Already Exists

```
Error: network tmux-agents already exists
```

**Solution:** This is normal. The runtime will reuse the existing network.

## Performance

### Benchmarks (M1 Mac, Docker Desktop)

- **Agent Spawn:** ~5-10 seconds (includes image pull, container start, tmux init)
- **Agent Kill:** ~2-3 seconds (graceful stop + remove)
- **List Agents:** ~100ms (Docker API query)
- **Memory Overhead:** ~100MB per container (base image + tmux + Node.js)

### Scaling

- Tested with 50 concurrent agents on 16GB RAM
- Each agent limited to 4GB RAM, 2 CPUs
- Total host resource usage: ~200MB + (n × agent memory)

## Security

- Containers run as root (required for tmux)
- No privileged mode
- No host networking
- Auth tokens mounted read-only
- Working directory mounted read-write (agent needs to modify files)
- No direct access to Docker socket from containers

## Future Enhancements

- [ ] GPU support (Dockerfile.gpu)
- [ ] Docker Compose orchestration
- [ ] Multi-host Docker Swarm support
- [ ] Container health checks
- [ ] Automatic image updates
- [ ] Volume snapshots for agent state
- [ ] Inter-agent communication via network
- [ ] Resource usage metrics collection
- [ ] Cost tracking per agent

# Tmux Agents

**AI agent orchestration across tmux, Docker, and Kubernetes**

Tmux Agents is a multi-client AI agent management system that lets you orchestrate 10-50+ concurrent AI agents (Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro) across local tmux sessions, remote SSH servers, Docker containers, and Kubernetes pods.

Built by [super-agent.ai](https://super-agent.ai)

---

## Features

- **Multi-Runtime Execution**: Run agents in tmux (local/SSH), Docker containers, or Kubernetes pods
- **Unified Management**: Control all agents through CLI, TUI, VS Code extension, or MCP server
- **Real-Time Monitoring**: WebSocket/Unix socket events for live updates
- **Agent Teams**: Define teams with specialized roles and task routing
- **Pipeline Orchestration**: Multi-stage DAG pipelines with dependency resolution
- **Task Management**: Priority-based routing with Kanban board visualization
- **Memory System**: Per-agent long-term memory with context management
- **Auto-Pilot Mode**: Autonomous agent monitoring and intervention
- **Session Persistence**: SQLite-backed state with cross-session continuity

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
├──────────────┬──────────────┬──────────────┬───────────┤
│  VS Code     │     CLI      │     TUI      │    MCP    │
│  Extension   │  (Commands)  │  (Terminal)  │  (Claude) │
└──────┬───────┴──────┬───────┴──────┬───────┴─────┬─────┘
       │              │              │             │
       └──────────────┴──────────────┴─────────────┘
                      │
                 JSON-RPC 2.0
                      │
       ┌──────────────▼──────────────┐
       │      Tmux Agents Daemon     │
       │  (Central orchestration)    │
       │  - Agent state management   │
       │  - Task routing             │
       │  - Pipeline execution       │
       │  - Multi-runtime support    │
       └──────────────┬──────────────┘
                      │
       ┌──────────────┴──────────────┐
       │                             │
       ▼                             ▼
┌─────────────┐              ┌──────────────┐
│   Tmux      │              │  Docker/K8s  │
│  (Local +   │              │  Containers  │
│   SSH)      │              │  & Pods      │
└─────────────┘              └──────────────┘
```

---

## Installation

### Prerequisites

- Node.js 18+ and npm
- tmux 3.0+ (for local/SSH runtimes)
- Docker (optional, for container runtime)
- kubectl (optional, for Kubernetes runtime)

### 1. Install from npm

```bash
npm install -g tmux-agents
```

### 2. Build from source

```bash
git clone https://github.com/super-agent-ai/tmux-agents
cd tmux-agents
npm install
npm run compile

# Optional: Build clients in worktrees
npm run compile:cli
npm run compile:tui
npm run compile:mcp
```

---

## Quick Start

### Start the Daemon

```bash
# Start daemon (runs in background)
tmux-agents-daemon start

# Check daemon status
tmux-agents-daemon status

# View daemon logs
tail -f ~/.tmux-agents/daemon.log
```

### CLI Usage

```bash
# Create an agent
tmux-agents create-agent "Code reviewer" --provider claude --model opus

# List agents
tmux-agents list-agents

# Assign task to agent
tmux-agents assign-task <agent-id> <task-id>

# Start agent
tmux-agents start-agent <agent-id>

# Monitor agent
tmux-agents show-agent <agent-id>

# Stop agent
tmux-agents stop-agent <agent-id>
```

### TUI (Terminal UI)

```bash
# Launch TUI
tmux-agents-tui

# Keyboard shortcuts:
# Tab/Shift+Tab - Navigate sections
# j/k - Move up/down
# Enter - Select/activate
# s - Start agent
# x - Stop agent
# d - Delete agent
# t - Assign task
# m - View memory
# / - Search
# ? - Help
# q - Quit
```

### VS Code Extension

1. Install "Tmux Agents" from VS Code marketplace
2. Open Command Palette (`Cmd+Shift+P`)
3. Run "Tmux Agents: Connect to Daemon"
4. Use sidebar tree view to manage agents

### MCP Server (for Claude Desktop)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tmux-agents": {
      "command": "node",
      "args": ["/path/to/tmux-agents/out-mcp/index.js"]
    }
  }
}
```

Claude can now control your agents via MCP tools:
- `tmux_agents_list` - List all agents
- `tmux_agents_create` - Create new agent
- `tmux_agents_assign_task` - Assign task
- `tmux_agents_get_status` - Get agent status
- And 50+ more tools...

---

## Configuration

### Daemon Configuration

Create `~/.tmux-agents/config.toml`:

```toml
[daemon]
host = "localhost"
port = 8765
log_level = "info"
log_file = "~/.tmux-agents/daemon.log"

[database]
path = "~/.tmux-agents/agents.db"
backup_interval = 3600

[orchestration]
max_concurrent_agents = 50
task_queue_size = 1000
default_timeout = 300

[tmux]
socket_path = "/tmp/tmux-agents"
session_prefix = "agent-"
default_shell = "/bin/bash"
```

### TUI Settings

Launch TUI and press `,` to open settings, or edit `~/.tmux-agents/tui-settings.json`:

```json
{
  "daemon.host": "localhost",
  "daemon.port": 8765,
  "display.theme": "dark",
  "display.refreshRate": 1000,
  "shortcuts.vim": true,
  "notifications.enabled": true
}
```

### AI Provider Configuration

Configure AI providers in daemon settings or per-agent:

```javascript
{
  "claude": {
    "command": "claude",
    "args": ["--print", "--model", "opus"],
    "defaultModel": "opus"
  },
  "gemini": {
    "command": "gemini",
    "args": ["--format", "json"],
    "defaultModel": "pro"
  }
}
```

---

## Core Concepts

### Agents

Agents are autonomous AI workers with:
- **Provider**: AI backend (Claude, Gemini, etc.)
- **Model**: Specific model (opus, sonnet, pro, etc.)
- **State**: IDLE, WORKING, PAUSED, ERROR, COMPLETED
- **Runtime**: tmux, docker, kubernetes
- **Memory**: Long-term context storage
- **Tasks**: Queue of assigned work

### Tasks

Tasks represent work units:
- **Priority**: 1-10 (1 = highest)
- **Status**: PENDING, IN_PROGRESS, COMPLETED, FAILED
- **Dependencies**: Task graph with blocked/blocking relationships
- **Routing**: Automatic assignment based on agent capabilities

### Teams

Teams group agents for coordinated work:
- **Roles**: lead, worker, reviewer, tester
- **Skills**: Tags like "frontend", "backend", "security"
- **Routing**: Tasks route to team members by role/skill match

### Pipelines

Multi-stage workflows with:
- **Stages**: Sequential or parallel execution
- **Dependencies**: DAG-based stage ordering
- **Rollback**: Automatic rollback on stage failure
- **Artifacts**: Stage outputs passed to next stage

---

## Key Features

### Multi-Runtime Support

Run agents anywhere:

```bash
# Local tmux
tmux-agents create-agent "Local worker" --runtime tmux

# Remote SSH
tmux-agents create-agent "Remote worker" \
  --runtime tmux \
  --server user@remote.example.com

# Docker container
tmux-agents create-agent "Container worker" \
  --runtime docker \
  --image ubuntu:22.04

# Kubernetes pod
tmux-agents create-agent "K8s worker" \
  --runtime kubernetes \
  --namespace agents \
  --pod-spec pod-config.yaml
```

### Auto-Pilot Mode

Autonomous monitoring and intervention:

```bash
# Enable auto-pilot for an agent
tmux-agents config-agent <agent-id> --auto-pilot true

# Auto-pilot will:
# - Monitor agent output
# - Detect errors/blocks
# - Auto-restart failed agents
# - Inject prompts when stuck
# - Report completion
```

### Agent Memory

Persistent context across sessions:

```bash
# View agent memory
tmux-agents show-memory <agent-id>

# Add memory entry
tmux-agents add-memory <agent-id> "Remember: use TypeScript strict mode"

# Clear old memories
tmux-agents clear-memory <agent-id> --before 30d
```

### Pipeline Orchestration

Complex multi-stage workflows:

```javascript
{
  "id": "build-test-deploy",
  "stages": [
    {
      "id": "build",
      "tasks": ["compile", "bundle"],
      "parallel": true
    },
    {
      "id": "test",
      "tasks": ["unit-tests", "integration-tests"],
      "dependsOn": ["build"]
    },
    {
      "id": "deploy",
      "tasks": ["deploy-staging"],
      "dependsOn": ["test"],
      "requiresApproval": true
    }
  ]
}
```

---

## Advanced Usage

### Custom Agent Templates

Define reusable agent configurations:

```javascript
{
  "name": "code-reviewer",
  "provider": "claude",
  "model": "opus",
  "systemPrompt": "You are a code reviewer...",
  "skills": ["code-review", "security-audit"],
  "autoMonitor": true,
  "memory": {
    "maxSize": 10000,
    "retentionDays": 30
  }
}
```

### Task Routing Rules

Configure intelligent task assignment:

```javascript
{
  "rules": [
    {
      "condition": { "tags": ["urgent"], "priority": [1, 3] },
      "assignTo": { "team": "on-call", "role": "lead" }
    },
    {
      "condition": { "tags": ["frontend"] },
      "assignTo": { "skills": ["react", "typescript"] }
    }
  ]
}
```

### Event Subscriptions

Listen to real-time events:

```javascript
const client = new TmuxAgentsClient('ws://localhost:8765');

client.on('agent.state_changed', (event) => {
  console.log(`Agent ${event.agentId} → ${event.newState}`);
});

client.on('task.completed', (event) => {
  console.log(`Task ${event.taskId} completed in ${event.duration}ms`);
});
```

---

## JSON-RPC API

The daemon exposes 40+ methods via JSON-RPC 2.0:

### Agent Management (10 methods)
- `agent.create` - Create new agent
- `agent.list` - List all agents
- `agent.get` - Get agent details
- `agent.update` - Update agent config
- `agent.delete` - Delete agent
- `agent.start` - Start agent
- `agent.stop` - Stop agent
- `agent.pause` - Pause agent
- `agent.resume` - Resume agent
- `agent.getOutput` - Get agent output

### Task Management (8 methods)
- `task.create` - Create task
- `task.list` - List tasks
- `task.get` - Get task details
- `task.assign` - Assign to agent
- `task.unassign` - Unassign from agent
- `task.setPriority` - Update priority
- `task.addDependency` - Add dependency
- `task.complete` - Mark complete

### Team Management (6 methods)
- `team.create`, `team.list`, `team.get`, `team.addMember`, `team.removeMember`, `team.delete`

### Pipeline Management (8 methods)
- `pipeline.create`, `pipeline.list`, `pipeline.get`, `pipeline.run`, `pipeline.pause`, `pipeline.resume`, `pipeline.cancel`, `pipeline.delete`

### Memory Management (4 methods)
- `memory.read`, `memory.write`, `memory.append`, `memory.clear`

### Runtime Management (6 methods)
- `runtime.list`, `runtime.getCapabilities`, `runtime.execute`, `runtime.cleanup`, `runtime.getStatus`, `runtime.configure`

### System Management (8 methods)
- `system.ping`, `system.getStatus`, `system.getMetrics`, `system.shutdown`, `system.restart`, `system.getConfig`, `system.updateConfig`, `system.getLogs`

See `CLAUDE.md` for full API documentation.

---

## Development

### Build

```bash
# Compile all components
npm run compile

# Watch mode (auto-rebuild)
npm run watch

# Build specific component
npm run compile:daemon
npm run compile:cli
npm run compile:tui
npm run compile:mcp
```

### Test

```bash
# Run all tests
npx vitest run

# Run with coverage
npx vitest run --coverage

# Run specific test suite
npx vitest run src/__tests__/daemon
npx vitest run src/__tests__/cli
```

Current test coverage: **653/661 tests passing (98.8%)**

### Debug

```bash
# Debug daemon with inspector
node --inspect out/daemon/index.js

# Verbose logging
DEBUG=tmux-agents:* tmux-agents-daemon start

# Tail all logs
tail -f ~/.tmux-agents/*.log
```

---

## Troubleshooting

### Daemon won't start

```bash
# Check if already running
ps aux | grep tmux-agents-daemon

# Kill existing daemon
pkill -f tmux-agents-daemon

# Check port availability
lsof -i :8765

# Start with verbose logging
DEBUG=* tmux-agents-daemon start
```

### Agent stuck in WORKING state

```bash
# Check agent output
tmux-agents show-agent <agent-id> --output

# Restart agent
tmux-agents stop-agent <agent-id>
tmux-agents start-agent <agent-id>

# Check tmux session exists
tmux ls | grep agent-
```

### Can't connect from client

```bash
# Verify daemon is running
tmux-agents-daemon status

# Test connection
curl http://localhost:8765/health

# Check firewall rules
sudo lsof -i :8765
```

### TUI display issues

```bash
# Reset terminal
reset

# Force 256 color mode
export TERM=xterm-256color

# Clear TUI cache
rm -rf ~/.tmux-agents/tui-cache
```

---

## Project Structure

```
tmux-agents/
├── src/                    # Main daemon and VS Code extension
│   ├── daemon/             # Central daemon server
│   ├── core/               # Shared core logic
│   ├── adapters/           # Phase 1 adapters
│   ├── extension.ts        # VS Code extension entry
│   └── __tests__/          # Test suites (498 tests)
├── tmux-agents-cli/        # CLI client (git worktree)
│   ├── src/                # CLI implementation
│   └── __tests__/          # CLI tests (544 tests)
├── tmux-agents-tui/        # TUI client (git worktree)
│   ├── src/                # React + Ink UI
│   └── __tests__/          # TUI tests (19 tests)
├── tmux-agents-mcp/        # MCP server (git worktree)
│   ├── src/                # MCP implementation
│   └── __tests__/          # MCP tests (55 tests)
└── docs/                   # Documentation
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repo
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run tests: `npx vitest run`
5. Commit: `git commit -m "feat: add my feature"`
6. Push: `git push origin feature/my-feature`
7. Create Pull Request

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Vitest for testing
- Conventional commits

---

## Resources

- **Documentation**: [CLAUDE.md](CLAUDE.md) - Developer reference
- **Website**: https://super-agent.ai
- **Issues**: https://github.com/super-agent-ai/tmux-agents/issues
- **Discord**: https://discord.gg/super-agent-ai

---

## License

MIT License - see [LICENSE](LICENSE) file for details

---

## Credits

Built by the [super-agent.ai](https://super-agent.ai) team.

Special thanks to:
- Anthropic Claude for AI capabilities
- tmux for terminal multiplexing
- VS Code team for extension API
- React and Ink for TUI framework

---

**Version**: 0.1.19
**Last Updated**: 2026-02-13

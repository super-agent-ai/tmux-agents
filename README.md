# Tmux Agents

**AI agent orchestration across tmux, Docker, and Kubernetes**

Tmux Agents is a daemon-based AI agent orchestration platform that lets you manage 10-50+ concurrent AI agents (Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro) across local tmux sessions, remote SSH servers, Docker containers, and Kubernetes pods.

Built by [super-agent.ai](https://super-agent.ai)

---

## Features

- **Multi-Runtime Execution**: Run agents in tmux (local/SSH), Docker containers, or Kubernetes pods
- **Multiple Clients**: CLI, TUI, VS Code extension, or MCP server (for Claude Desktop)
- **Daemon Architecture**: Central orchestration daemon with JSON-RPC 2.0 API
- **Real-Time Updates**: WebSocket events for live monitoring
- **Agent Teams**: Coordinate multiple agents with specialized roles
- **Pipeline Orchestration**: Multi-stage DAG pipelines with dependency resolution
- **Task Management**: Kanban board with priority-based routing
- **Memory System**: Per-agent long-term memory with context management
- **Auto-Pilot Mode**: Autonomous monitoring and intervention
- **Session Persistence**: SQLite-backed state with crash recovery

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
├──────────────┬──────────────┬──────────────┬───────────┤
│  VS Code     │     CLI      │     TUI      │    MCP    │
│  Extension   │  (Commands)  │  (Dashboard) │  (Claude) │
└──────┬───────┴──────┬───────┴──────┬───────┴─────┬─────┘
       │              │              │             │
       │         Unix Socket / HTTP / WebSocket    │
       └──────────────┴──────────────┴─────────────┘
                      │
                 JSON-RPC 2.0
                      │
       ┌──────────────▼──────────────┐
       │   Tmux Agents Daemon        │
       │   (Background server)       │
       │  • Agent orchestration      │
       │  • Task routing             │
       │  • Pipeline execution       │
       │  • Multi-runtime support    │
       │  • SQLite persistence       │
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

### Install from npm

```bash
npm install -g tmux-agents
```

### Build from source

```bash
git clone https://github.com/super-agent-ai/tmux-agents
cd tmux-agents
npm install

# Build all packages
npm run compile
npm run compile --workspaces

# Or build specific packages
npm run build -w packages/cli
npm run build -w packages/tui
npm run build -w packages/mcp
```

---

## Quick Start

### 1. Start the Daemon

```bash
# Start daemon (runs in background)
npx tmux-agents daemon start

# Check daemon status
npx tmux-agents daemon status

# View daemon health
npx tmux-agents health
```

### 2. Spawn Your First Agent

```bash
# Spawn a coder agent
npx tmux-agents agent spawn -r coder "Fix the login bug"

# Spawn with specific provider
npx tmux-agents agent spawn -r coder -p claude "Add dark mode"

# List all agents
npx tmux-agents agent list

# Get agent output (follow mode)
npx tmux-agents agent output <agent-id> -f
```

### 3. Choose Your Interface

#### CLI (Command Line)

```bash
# All commands available
npx tmux-agents --help

# Agent management
npx tmux-agents agent spawn -r coder "task description"
npx tmux-agents agent list
npx tmux-agents agent output <id> -f
npx tmux-agents agent kill <id>

# Task management
npx tmux-agents task submit "task description" --priority high
npx tmux-agents task list
npx tmux-agents task move <id> doing

# Team collaboration
npx tmux-agents team create "team-name"
npx tmux-agents agent spawn -t team-name -r coder "task"

# Pipeline orchestration
npx tmux-agents pipeline run --stages @pipeline.json
```

#### TUI (Terminal UI Dashboard)

```bash
# Launch interactive dashboard
npx tmux-agents tui

# Or directly
node packages/tui/dist/tui/index.js
```

**Keyboard shortcuts:**
- `F1` - Agents view
- `F2` - Tasks view
- `F3` - Pipelines view
- `F4` - Settings
- `Enter` - Preview agent
- `a` - Attach to agent
- `q` - Quit

#### VS Code Extension

1. Open VS Code
2. The extension auto-connects to the daemon
3. Use Command Palette: `Tmux Agents: ...`
4. Or use the sidebar tree view

#### MCP Server (for Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tmux-agents": {
      "command": "node",
      "args": ["/absolute/path/to/tmux-agents/packages/mcp/dist/server.js"]
    }
  }
}
```

Then in Claude Desktop:
- "List all my agents"
- "Spawn a coder agent to implement feature X"
- "Get output from agent abc123"
- "Show me the task board"

---

## Common Workflows

### Single Agent Task

```bash
# 1. Spawn agent
AGENT_ID=$(npx tmux-agents agent spawn -r coder "Implement auth" --json | jq -r '.id')

# 2. Watch output
npx tmux-agents agent output $AGENT_ID -f

# 3. Send follow-up prompt
npx tmux-agents agent prompt $AGENT_ID "Add tests for the auth flow"

# 4. Kill when done
npx tmux-agents agent kill $AGENT_ID
```

### Team Collaboration

```bash
# 1. Create team
npx tmux-agents team create "auth-team"

# 2. Spawn team members
npx tmux-agents agent spawn -r coder -t auth-team "Implement login"
npx tmux-agents agent spawn -r tester -t auth-team "Write auth tests"
npx tmux-agents agent spawn -r reviewer -t auth-team "Review auth code"

# 3. Monitor team
npx tmux-agents agent list --team auth-team
```

### Pipeline Execution

```bash
# 1. Define pipeline
cat > pipeline.json <<'EOF'
{
  "name": "CI Pipeline",
  "stages": [
    {
      "name": "build",
      "role": "coder",
      "prompt": "Build the project"
    },
    {
      "name": "test",
      "role": "tester",
      "prompt": "Run all tests",
      "dependencies": ["build"]
    },
    {
      "name": "review",
      "role": "reviewer",
      "prompt": "Review the changes",
      "dependencies": ["test"]
    }
  ]
}
EOF

# 2. Run pipeline
npx tmux-agents pipeline run --stages @pipeline.json
```

### Fan-Out (Parallel Execution)

```bash
# Execute same prompt across N agents
npx tmux-agents fan-out "Run benchmark suite" --count 5

# With specific runtime
npx tmux-agents fan-out "Test on different configs" --count 3 --runtime docker
```

### Task Board Management

```bash
# Submit tasks
npx tmux-agents task submit "Fix login bug" --priority high
npx tmux-agents task submit "Add dark mode" --priority medium

# View board
npx tmux-agents task list

# Move tasks through columns
npx tmux-agents task move <task-id> todo
npx tmux-agents task move <task-id> doing
npx tmux-agents task move <task-id> review
npx tmux-agents task move <task-id> done
```

---

## Multi-Runtime Support

### Local Tmux (Default)

```bash
npx tmux-agents agent spawn -r coder "task"
```

### Docker Containers

```bash
npx tmux-agents agent spawn -r coder "task" \
  --runtime docker \
  --image ubuntu:22.04 \
  --memory 2g
```

### Kubernetes Pods

```bash
npx tmux-agents agent spawn -r coder "task" \
  --runtime k8s \
  --namespace agents \
  --memory 2Gi \
  --cpus 2
```

---

## Configuration

### Daemon Configuration

The daemon stores data in `~/.tmux-agents/`:
- `daemon.sock` - Unix socket (primary transport)
- `tmux-agents.db` - SQLite database (persistence)
- `daemon.log` - Daemon logs

Default ports:
- HTTP: `3456` (fallback transport)
- WebSocket: `3457` (event subscriptions)

### TUI Settings

Launch TUI and press `F4` for settings, or edit `~/.tmux-agents/tui-settings.json`:

```json
{
  "daemon.host": "localhost",
  "daemon.port": 3456,
  "daemon.autoConnect": true,
  "display.theme": "dark",
  "display.refreshRate": 1000,
  "shortcuts.vim": true,
  "notifications.enabled": true
}
```

---

## JSON-RPC API

The daemon exposes 50+ methods via JSON-RPC 2.0:

### Agent Management
- `agent.list`, `agent.spawn`, `agent.kill`, `agent.getOutput`, `agent.sendPrompt`, `agent.fanOut`

### Task Management
- `task.list`, `task.submit`, `task.move`, `task.get`, `task.update`, `task.delete`

### Team Management
- `team.list`, `team.create`, `team.delete`, `team.addAgent`, `team.removeAgent`

### Pipeline Management
- `pipeline.list`, `pipeline.run`, `pipeline.get`, `pipeline.pause`, `pipeline.resume`, `pipeline.cancel`

### Runtime Management
- `runtime.list`, `runtime.getCapabilities`, `runtime.execute`, `runtime.getStatus`

### System Management
- `dashboard.get`, `health.check`, `daemon.status`, `daemon.shutdown`, `daemon.restart`

See full API documentation in `CLAUDE.md`.

---

## Development

### Project Structure

```
tmux-agents/                    # Monorepo root
├── src/                        # Main VS Code extension
│   ├── extension.ts            # Extension entry point
│   ├── core/                   # Core business logic
│   ├── orchestrator.ts         # Agent orchestration
│   ├── pipelineEngine.ts       # Pipeline execution
│   └── __tests__/              # Test suites (653 tests)
├── packages/                   # Client packages
│   ├── cli/                    # CLI client
│   │   ├── src/cli/            # CLI implementation
│   │   ├── dist/               # Compiled output
│   │   └── __tests__/          # CLI tests (15 tests)
│   ├── tui/                    # Terminal UI
│   │   ├── src/tui/            # React + Ink UI
│   │   ├── dist/               # Compiled output
│   │   └── __tests__/          # TUI tests (31 tests)
│   ├── mcp/                    # MCP server
│   │   ├── src/                # MCP implementation
│   │   ├── dist/               # Compiled output
│   │   └── __tests__/          # MCP tests (55 tests)
│   └── k8s-runtime/            # Kubernetes runtime
│       ├── src/runtimes/       # K8s runtime implementation
│       └── dist/               # Compiled output
└── out/                        # Main extension compiled output
```

### Build

```bash
# Build all
npm run compile                 # Main extension
npm run compile --workspaces    # All packages

# Build specific package
npm run build -w packages/cli
npm run build -w packages/tui
npm run build -w packages/mcp
npm run build -w packages/k8s-runtime

# Watch mode (auto-rebuild)
npm run watch
npm run watch -w packages/cli
```

### Test

```bash
# Run all tests
npm test                        # Main extension tests
npm test --workspaces           # All package tests

# Run specific package tests
npm test -w packages/cli        # 15/15 tests
npm test -w packages/tui        # 31/31 tests
npm test -w packages/mcp        # 55/55 tests

# With coverage
npm test -- --coverage
```

**Current test status: 754/762 tests passing (98.9%)**

### Debug

```bash
# Debug daemon
node --inspect out/daemon/index.js

# Verbose logging
DEBUG=tmux-agents:* npx tmux-agents daemon start

# Check logs
tail -f ~/.tmux-agents/daemon.log
```

---

## Troubleshooting

### Daemon Issues

```bash
# Check status
npx tmux-agents daemon status

# Restart daemon
npx tmux-agents daemon restart

# Check health
npx tmux-agents health --json

# View logs
tail -f ~/.tmux-agents/daemon.log
```

### Agent Issues

```bash
# Check agent output
npx tmux-agents agent output <agent-id>

# Check tmux session
tmux ls | grep tmux-agents

# Kill stuck agent
npx tmux-agents agent kill <agent-id>
```

### Connection Issues

```bash
# Test socket connection
ls -la ~/.tmux-agents/daemon.sock

# Test HTTP fallback
curl http://localhost:3456/health

# Check if daemon is running
ps aux | grep "tmux-agents daemon"
```

### TUI Display Issues

```bash
# Reset terminal
reset

# Force 256 color mode
export TERM=xterm-256color

# Reinstall dependencies
cd packages/tui && npm install
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repo
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run tests: `npm test && npm test --workspaces`
5. Commit: `git commit -m "feat: add my feature"`
6. Push and create Pull Request

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Vitest for testing (not Jest)
- Conventional commits
- All imports must include `.js` extensions (ESM requirement)

---

## Resources

- **Developer Guide**: [CLAUDE.md](CLAUDE.md) - Architecture and API reference
- **Completion Report**: [COMPLETION_REPORT.md](COMPLETION_REPORT.md) - Refactoring status
- **Website**: https://super-agent.ai
- **Issues**: https://github.com/super-agent-ai/tmux-agents/issues

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
- Model Context Protocol (MCP) team

---

**Version**: 0.1.19
**Last Updated**: 2026-02-13
**Test Status**: 754/762 passing (98.9%)

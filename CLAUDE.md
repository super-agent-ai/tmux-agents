# CLAUDE.md

## Project Overview

**Tmux Agents** — A daemon-based AI agent orchestration platform built by super-agent.ai. Manages 10-50 concurrent AI agents (Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro) across multiple execution environments with multiple client interfaces.

**Architecture:** Daemon-based with multiple clients (VS Code, CLI, TUI, MCP) and multiple runtimes (local tmux, SSH tmux, Docker containers, Kubernetes pods).

## Quick Start

```bash
# Install dependencies
npm install

# Build everything
npm run compile

# Start the daemon
cd /Users/chelsea/dev/tmux-agents
node out/daemon/supervisor.js start

# Use the CLI
cd /Users/chelsea/dev/tmux-agents-cli
./dist/cli/index.js daemon status
./dist/cli/index.js agent list

# Or use the TUI
cd /Users/chelsea/dev/tmux-agents-tui
npm run start:tui

# Or use VS Code extension (press F5)
```

## Architecture

### High-Level

```
Clients:     VS Code  │  CLI  │  TUI  │  MCP Server
             (HTTP/WS)│ (Unix │ (Unix │ (stdio)
                      │socket)│socket)│
                 └──────┴───┬───┴───┬─────┘
                            │       │
Daemon:              ┌──────▼───────▼──────┐
                     │  JSON-RPC API       │
                     │  (40+ methods)      │
                     ├─────────────────────┤
                     │  Services           │
                     │  • Orchestrator     │
                     │  • PipelineEngine   │
                     │  • TaskRouter       │
                     ├─────────────────────┤
                     │  SQLite DB          │
                     └──────┬──────────────┘
                            │
Runtimes:            ┌──────▼──────────────┐
                     │  RuntimeManager     │
                     │  ├─ Tmux (local)    │
                     │  ├─ SSH (remote)    │
                     │  ├─ Docker          │
                     │  └─ Kubernetes      │
                     └─────────────────────┘
```

### Core Abstraction

All runtimes use tmux via `TmuxService(prefix)`:
- Local: `TmuxService('')`
- SSH: `TmuxService('ssh user@host')`
- Docker: `TmuxService('docker exec container')`
- K8s: `TmuxService('kubectl exec pod --')`

## Project Structure

**Main Repo:** `/Users/chelsea/dev/tmux-agents`
- `src/core/` - Platform-agnostic logic (24 files, zero VS Code deps)
- `src/daemon/` - Daemon server (9 modules, 47 tests)
- `src/mcp/` - MCP server (55 tests)
- `src/runtimes/` - Docker runtime
- `src/client/` - Daemon client library
- `src/*.ts` - VS Code extension (adapters to core/)

**CLI:** `/Users/chelsea/dev/tmux-agents-cli`
- 13 command groups, 42+ commands, 544 tests

**TUI:** `/Users/chelsea/dev/tmux-agents-tui`
- 4 tabs: Agents, Tasks, Pipelines, Settings
- React 19 + Ink v6, WebSocket events

**K8s:** `/Users/chelsea/dev/tmux-agents-k8s`
- Pod lifecycle, watcher, warm pool

## Build & Test

```bash
# Main
npm install && npm run compile
npx vitest run  # 653 tests

# CLI
cd /Users/chelsea/dev/tmux-agents-cli
npm install && npm run build:cli
npx vitest run  # 544 tests

# TUI  
cd /Users/chelsea/dev/tmux-agents-tui
npm install && npm run compile:tui

# K8s
cd /Users/chelsea/dev/tmux-agents-k8s
npm install && npm run compile
```

## Daemon API (JSON-RPC 2.0)

**40+ methods across 7 categories:**
- Agent (8): list, get, spawn, kill, sendPrompt, getOutput, getStatus, getAttachCommand
- Task (7): list, get, submit, move, cancel, delete, update
- Team (7): list, create, delete, addAgent, removeAgent, quickCode, quickResearch  
- Pipeline (8): list, create, run, getStatus, getActive, pause, resume, cancel
- Kanban (7): listLanes, createLane, editLane, deleteLane, getBoard, startTask, stopTask
- Runtime (4): list, add, remove, ping
- Daemon (5): health, config, reload, stats, shutdown
- Fanout (1): run

**Endpoints:**
- Unix socket: `~/.tmux-agents/daemon.sock` (fastest)
- HTTP: `http://localhost:7331/rpc`
- WebSocket: `ws://localhost:7331/ws` (events)
- SSE: `http://localhost:7331/events`

## Configuration

**Daemon:** `~/.tmux-agents/config.toml`
```toml
[daemon]
port = 7331
log_level = "info"

[[runtimes]]
id = "local"
type = "tmux"
```

**TUI:** `~/.tmux-agents/tui-settings.json`
- 25 settings across 6 categories
- Editable via Settings tab (press `4`)

## Key Features

**Daemon:**
- Multi-process (supervisor/worker)
- Crash recovery (reconnects to agents)
- Multi-protocol API
- Circuit breaker (prevents restart loops)
- Structured logging (50MB rotation)
- Hot config reload (SIGHUP)

**CLI:**
- 42+ commands
- Shell completion (bash/zsh/fish)
- Table/kanban formatters

**TUI:**
- Real-time updates (WebSocket)
- Settings UI (25+ parameters)
- Vim-style navigation
- Search/filter

**MCP:**
- 12 tools, 4 resources, 3 prompts
- Works with Claude Code

**Runtimes:**
- Docker: Container lifecycle, resource limits
- K8s: Pod lifecycle, GPU scheduling, warm pool
- SSH: Remote execution, connection pooling

## Coding Conventions

- **Classes:** PascalCase
- **Functions:** camelCase  
- **Enums:** UPPER_SNAKE_CASE
- **No `any`** (except vscode compat layers)
- **Strict TypeScript**
- **Section comments:** `// ─── Name ───────────────`

## Entry Points

**Daemon:**
```bash
node out/daemon/supervisor.js start  # Background
node out/daemon/supervisor.js run    # Foreground
```

**CLI:**
```bash
./dist/cli/index.js --help
```

**TUI:**
```bash
npm run start:tui
```

**MCP:**
Add to Claude Code config:
```json
{
  "mcpServers": {
    "tmux-agents": {
      "command": "node",
      "args": ["/path/to/out/mcp/mcp/server.js"]
    }
  }
}
```

**VS Code:**
Press F5 (Run Extension)

## Troubleshooting

**Daemon won't start:**
```bash
cat ~/.tmux-agents/daemon.pid  # Check if running
tail -f ~/.tmux-agents/daemon.log  # Check logs
rm ~/.tmux-agents/daemon.pid  # Remove stale PID
```

**CLI can't connect:**
```bash
node out/daemon/supervisor.js status  # Check daemon
ls -la ~/.tmux-agents/daemon.sock  # Check socket
```

## Resources

- Main: /Users/chelsea/dev/tmux-agents
- CLI: /Users/chelsea/dev/tmux-agents-cli
- TUI: /Users/chelsea/dev/tmux-agents-tui
- K8s: /Users/chelsea/dev/tmux-agents-k8s
- Docs: /Users/chelsea/dev/tmux-agents-refactor/memory/

---

**Last Updated:** 2026-02-13
**Status:** Production-ready (653/661 tests passing)
**Architecture:** Daemon-based multi-client multi-runtime

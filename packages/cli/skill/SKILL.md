---
name: tmux-agents
description: >
  Manage AI agent orchestration via the tmux-agents CLI. Use when the user wants to:
  spawn, list, kill, or interact with AI agents (Claude, Gemini, Codex, Aider, etc.);
  create and manage tasks on a kanban board with swim lanes;
  compose agent teams for collaborative work;
  run multi-stage pipelines (DAG execution);
  fan-out prompts to multiple agents simultaneously;
  configure runtimes (local tmux, SSH, Docker, Kubernetes);
  or check daemon health and status.
  Triggers on: agent management, task boards, kanban operations, AI orchestration,
  multi-agent workflows, pipeline execution, team coordination, tmux session management.
---

# tmux-agents CLI Skill

Orchestrate 10-50+ concurrent AI agents across local tmux, remote SSH, Docker, and Kubernetes runtimes via the `tmux-agents` CLI.

## Prerequisites

The daemon must be running before any commands work:

```bash
# Start daemon (background)
tmux-agents daemon start

# Or foreground for debugging
tmux-agents daemon run --debug

# Verify
tmux-agents health
```

## Core Concepts

- **Tasks = Agents**: Tasks and agents are unified. A running task **is** an agent. `agent list` returns currently running tasks as agents. `agent attach`, `agent kill`, and `agent output` all accept task IDs. `agent spawn` creates a task + swim lane behind the scenes.
- **Tasks**: Work items on a kanban board (backlog/todo/doing/review/done). When started, a task spawns an AI agent in a tmux window.
- **Swim Lanes**: Isolated workstreams with their own working directory, provider, and WIP limits
- **Teams**: Named groups of agents working together
- **Pipelines**: Multi-stage DAG workflows where stages pass artifacts
- **Runtimes**: Execution environments (local, SSH, Docker, K8s) - all use tmux internally

## Best Practices

### 1. Always Check Command Help First

Before using any command, check the help to understand exact syntax:

```bash
# Check available flags and their purpose
tmux-agents task submit --help
tmux-agents kanban create-lane --help
tmux-agents agent spawn --help
```

This prevents errors and ensures you use the right flags (e.g., `--title` for short titles vs the main argument for full descriptions).

### 2. Verify Resource Names/IDs Before Using Them

Before referencing lanes, agents, tasks, or teams, **list them first** to get exact names and IDs:

```bash
# ✓ BEFORE creating a task, check what lanes exist
tmux-agents kanban lanes --json
# Shows: {"id": "abc-123", "name": "backend"}

# ✓ Then use the EXACT name or (better) the ID
tmux-agents task submit "Fix bug" --lane backend  # by name
tmux-agents task submit "Fix bug" --lane abc-123  # by ID (more reliable)

# ✓ BEFORE sending to an agent, list agents
tmux-agents agent list --json
# Shows: {"id": "def-456", "role": "coder", ...}

# ✓ Then use the exact agent ID
tmux-agents agent send def-456 "Continue working"
```

**Why this matters:**
- Lane names can be similar (e.g., "tmux-agent" vs "tmux-agents")
- IDs are unique and never change
- Using wrong names creates orphaned tasks in non-existent lanes
- Typos in names fail silently or create unexpected behavior

## Common Gotchas

### 1. Daemon Must Be Running

Every command except `daemon start` requires a running daemon. If you get connection errors:

```bash
tmux-agents daemon start
tmux-agents health   # verify it's healthy
```

### 2. Always Verify Lane Names Before Using Them

Lane names must match **exactly**. Typos silently create orphaned tasks:

```bash
# ✓ ALWAYS check first
tmux-agents kanban lanes --json

# ✓ Use the exact name or (better) the ID
tmux-agents task submit "Fix bug" --lane abc-123   # by ID (safest)
tmux-agents task submit "Fix bug" --lane backend   # by name (must match exactly)

# ❌ NEVER guess lane names
tmux-agents task submit "Fix bug" --lane back-end  # wrong if lane is "backend"
```

### 3. `--start` vs `--auto-start` Are Different

- **`--start`**: Immediately starts the task after submit (one-shot action)
- **`--auto-start`**: Sets a flag so the task auto-starts when lane WIP allows (persistent toggle, inherited from lane defaults)

Use `--start` for "submit and run now". Use `--auto-start` on lanes for autonomous workflows.

### 4. JSON Arguments Need Shell Quoting

Pipeline stages and team agents use JSON arguments. Always wrap in single quotes:

```bash
# ✓ Correct — single-quoted JSON
tmux-agents pipeline create "deploy" --stages '[{"name":"lint","role":"coder","prompt":"Run lint"}]'

# ❌ Wrong — shell will mangle unquoted JSON
tmux-agents pipeline create "deploy" --stages [{"name":"lint"}]
```

### 5. `--description` Flag Does Not Exist on `task submit`

The task description is the **positional argument**, not a flag:

```bash
# ✓ Correct
tmux-agents task submit "Long description here..." --title "Short title"

# ❌ Wrong (--description is not a valid flag, silently ignored)
tmux-agents task submit --description "Long description" --title "Short title"
```

### 6. Not Yet Implemented Commands

These commands are registered but will return errors:

- `daemon run` — use `daemon start --foreground` instead
- `daemon logs` — use `tail -f ~/.tmux-agents/daemon.log` instead
- `agent output --follow` — use `agent attach` for live monitoring instead

## Quick Start Workflows

### Spawn a single agent

```bash
# Basic spawn
tmux-agents agent spawn "Fix the login bug in auth.ts" --role coder --provider claude

# Spawn into a specific swim lane (inherits lane workdir, provider, toggles)
tmux-agents agent spawn "Fix the login bug" --role coder --lane backend
```

### Submit and start a task

```bash
# With just description (short)
tmux-agents task submit "Refactor database layer" \
  --priority high --column todo --role coder \
  --lane backend --auto-start --auto-pilot

# With title + detailed description (recommended for complex tasks)
tmux-agents task submit "Bug: Database connection pool exhaustion under high load.
Need to investigate connection lifecycle, implement proper cleanup,
add connection timeout handling, and test with load simulation.

Acceptance criteria:
- No connection leaks under 1000 req/s
- Proper error handling on pool exhaustion
- Metrics for pool usage" \
  --title "Fix database connection pool leak" \
  --priority high --column todo --role coder \
  --lane backend --auto-start --auto-pilot
```

### Fan-out a prompt to multiple agents

```bash
tmux-agents fan-out "Review this PR for security issues" --count 3 --provider claude
```

### Create a coding team

```bash
tmux-agents team quick-code /path/to/project
```

### Run a pipeline

```bash
tmux-agents pipeline create "deploy" --stages '[
  {"name":"lint","role":"coder","prompt":"Run linting"},
  {"name":"test","role":"tester","prompt":"Run tests","dependencies":["lint"]},
  {"name":"deploy","role":"ops","prompt":"Deploy to staging","dependencies":["test"]}
]'
tmux-agents pipeline run <pipeline-id>
```

## Command Reference Overview

| Command Group | Purpose | Key Subcommands |
|---|---|---|
| `daemon` | Daemon lifecycle | `start`, `stop`, `status`, `logs`, `stats` |
| `agent` | Agent lifecycle | `spawn`, `list`, `kill`, `send`, `output`, `attach` |
| `task` | Task management | `submit`, `list`, `start`, `stop`, `move`, `watch`, `output` |
| `kanban` | Board + swim lanes | `board`, `lanes`, `create-lane`, `submit`, `start`, `stop` |
| `team` | Team composition | `create`, `list`, `delete`, `quick-code`, `quick-research` |
| `pipeline` | DAG execution | `create`, `run`, `status`, `pause`, `resume`, `cancel` |
| `runtime` | Runtime config | `list`, `add`, `remove`, `ping` |
| `role` | Custom roles | `list`, `create`, `update`, `delete` |
| `backend` | Backend sync | `list`, `add`, `sync`, `enable`, `disable` |
| `fan-out` | Multi-agent dispatch | `<prompt> --count N` |
| `skill` | Claude Code skill | `install`, `uninstall`, `list` |

For complete command syntax and all flags, see [references/commands.md](references/commands.md).

## Key Patterns

### Task Lifecycle

```
submit (backlog/todo) -> start (doing, agent spawned) -> complete (done) -> close
                                                      -> stop (paused)
                                                      -> cancel (cancelled)
```

### Agent Task Flow

1. Submit task with `task submit` or `kanban submit`
2. Start with `task start <id>` or `kanban start <id>` (spawns agent)
3. Monitor with `task watch <id>` or `task output <id> --follow`
4. Agent auto-moves task to done on completion (if `--auto-close`)

### Progress Reporting & Heartbeats

Running tasks receive **automatic heartbeat messages** every 5 minutes asking the agent for a progress update. The agent responds with a structured progress marker that the daemon detects and stores in the task's `output` field.

- **Live progress**: Check `task output <id>` to see the latest progress (phase, status, files modified)
- **Heartbeat-driven**: The daemon pastes a heartbeat prompt into the agent's tmux pane; the agent responds with `<task-progress>` markers
- **Auto-completion**: When `--auto-close` is enabled, the agent signals done via `<promise>DONE</promise>` and the daemon completes the task and closes the tmux session
- **Works with all tasks**: Progress reporting is enabled for all started tasks, regardless of `--auto-close`

### Swim Lane Isolation

Lanes scope work by directory, provider, and concurrency. Lanes can also set **default toggles** (`--auto-start`, `--auto-pilot`, `--auto-close`, `--use-worktree`, `--use-memory`) that are inherited by all tasks submitted to that lane:

```bash
# Basic lane
tmux-agents kanban create-lane frontend --workdir ./src/ui --provider claude --wip-limit 3

# Fully autonomous lane (all tasks auto-start, auto-pilot, auto-close)
tmux-agents kanban create-lane backend --workdir ./src/api --provider claude --wip-limit 2 \
  --auto-start --auto-pilot --auto-close

# Add context instructions (injected into every agent in the lane)
tmux-agents kanban edit-lane <lane-id> --context "Build after changes, then commit."

# Tasks inherit lane defaults — no need to pass --auto-start --auto-pilot per task
tmux-agents kanban submit "Add rate limiting" --lane backend --role coder
```

### Runtime Selection

All runtimes wrap tmux with different exec prefixes:

```bash
# Local (default)
tmux-agents agent spawn "task" --role coder

# Remote SSH
tmux-agents runtime add prod-server --type ssh --host user@10.0.1.5
tmux-agents agent spawn "task" --role coder --runtime prod-server

# Docker
tmux-agents runtime add dev-container --type docker --image node:20
tmux-agents agent spawn "task" --role coder --runtime dev-container

# Kubernetes
tmux-agents runtime add k8s-cluster --type kubernetes --namespace agents
tmux-agents agent spawn "task" --role coder --runtime k8s-cluster
```

## Output Formats

Most commands support `--json` for machine-readable output:

```bash
tmux-agents agent list --json | jq '.[] | select(.status == "working")'
tmux-agents task list --json
tmux-agents kanban board --json
```

Default output uses colored tables with status icons.

## Monitoring

```bash
# Dashboard overview
tmux-agents dashboard

# Follow agent output in real-time
tmux-agents agent output <id> --follow

# Watch task progress
tmux-agents task watch <id> --output

# Daemon logs
tmux-agents daemon logs --follow

# Daemon statistics
tmux-agents daemon stats
```

## Common Workflow Patterns

For multi-step workflow examples (team setup, pipeline orchestration, kanban-driven development), see [references/workflows.md](references/workflows.md).

## Transport

The CLI connects to the daemon via:
1. **Unix socket** `~/.tmux-agents/daemon.sock` (preferred)
2. **HTTP** `http://127.0.0.1:3456` (fallback)
3. **WebSocket** `ws://127.0.0.1:3457` (events/streaming)

Connection is automatic — no configuration needed for local use.

### Remote Daemon

Connect to a daemon running on another machine:

```bash
# CLI / TUI — use --ip flag
tmux-agents task list --ip 192.168.1.10:3456
tmux-agents tui --ip 192.168.1.10:3456

# Or via SSH tunnel (daemon stays on 127.0.0.1, more secure)
ssh -L 3456:127.0.0.1:3456 -L 3457:127.0.0.1:3457 user@remote -N &
tmux-agents tui --ip localhost:3456
```

VS Code: set `tmuxAgents.daemonUrl` to `host:port` in settings. HTTP port +1 = WS port (3456→3457).

Start daemon for remote access: `tmux-agents daemon start --bind 0.0.0.0`

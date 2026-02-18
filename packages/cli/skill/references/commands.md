# tmux-agents CLI Command Reference

Complete reference for all CLI commands, subcommands, and flags.

## Best Practices

**Before using any command, check its help first:**

```bash
tmux-agents <command> <subcommand> --help
```

This shows:
- Exact argument syntax (positional vs flags)
- All available options and their purposes
- Correct flag names (prevents errors like `--description` which doesn't exist)

**Example workflow:**
```bash
# ✓ Check help first
tmux-agents task submit --help

# ✓ Then use the command with correct syntax
tmux-agents task submit "Detailed description..." --title "Short title" --lane backend
```

## Table of Contents

- [daemon](#daemon) - Daemon lifecycle management
- [agent](#agent) - Agent spawn, control, and monitoring
- [task](#task) - Task CRUD and execution
- [kanban](#kanban) - Kanban board and swim lanes
- [team](#team) - Team composition and quick-start
- [pipeline](#pipeline) - Multi-stage DAG pipelines
- [runtime](#runtime) - Runtime environment configuration
- [role](#role) - Custom role definitions
- [backend](#backend) - Backend integration sync
- [fan-out](#fan-out) - Multi-agent prompt dispatch
- [Standalone Commands](#standalone-commands) - dashboard, health, tui, web

---

## daemon

Manage the tmux-agents daemon process.

```
daemon start [--foreground] [--bind <address>]   # Start daemon (background by default)
daemon stop                           # Graceful shutdown
daemon restart                        # Stop + start
daemon status [--json]                # Show daemon status
daemon config [--json]                # Show daemon configuration
daemon stats [--json]                 # Show daemon statistics
daemon reload                         # Reload configuration without restart
```

> **Note:** `daemon run` and `daemon logs` are registered but **not yet implemented**. Use `daemon start --foreground` to run in foreground, and `tail -f ~/.tmux-agents/daemon.log` to view logs.

---

## agent

Manage AI agent lifecycle. **Agents are unified with tasks** — `agent list` returns running tasks synthesized as agents, and all agent commands (`attach`, `kill`, `output`, `send`) accept task IDs.

### List and inspect

```
agent list [-s|--status <status>]     # Filter: idle|working|error|completed
           [-r|--role <role>]         # Filter by role
           [-t|--team <team>]         # Filter by team
           [--runtime <runtime>]      # Filter by runtime
           [--json]
agent info <id> [--json]              # Detailed agent info (accepts task ID)
agent status <id> [--json]            # Agent status only (accepts task ID)
```

### Spawn and control

```
agent spawn <task>                    # Spawn new agent (creates a task + lane)
  -r|--role <role>                    # Required: coder, tester, reviewer, ops, researcher, etc.
  [-p|--provider <provider>]          # claude, gemini, codex, aider, opencode, cursor, copilot, amp, cline, kiro
  [-w|--workdir <path>]              # Working directory
  [-l|--lane <lane>]                 # Swim lane name or ID (inherits lane defaults)
  [--runtime <runtime>]              # Runtime name (default: local)
  [--image <image>]                  # Docker/K8s image
  [--memory <memory>]                # Container memory limit
  [--cpus <cpus>]                    # Container CPU limit
  [-t|--team <team>]                 # Assign to team
  [--json]
agent kill <id>                       # Terminate agent (accepts task ID)
agent send <id> <prompt> [--no-wait]  # Send prompt to running agent (accepts task ID)
```

### Monitor

```
agent output <id> [-n|--lines <n>]    # Get terminal output (accepts task ID)
agent attach <id>                     # Print tmux attach command (accepts task ID)
```

> **Note:** `agent output --follow` is registered but **not yet implemented**. Use `agent attach <id>` instead for live terminal access.

---

## task

Manage tasks on the kanban board.

### List and inspect

```
task list [-c|--column <column>]      # Filter by column
          [-l|--lane <lane>]          # Filter by swim lane
          [--json]
task board [-l|--lane <lane>]         # Show kanban board (ASCII)
task show <id> [--json]               # Full task details
task status <id> [--json]             # Task status only
```

### Create

```
task submit <description>
  [-p|--priority <priority>]          # low, medium, high, critical
  [-c|--column <column>]             # backlog, todo, doing, review, done
  [-r|--role <role>]                 # Agent role for execution
  [-l|--lane <lane>]                 # Swim lane name
  [--title <title>]                  # Short title (description used if omitted)
  [--tags <tags>]                    # Comma-separated tags
  [--depends-on <ids>]              # Comma-separated dependency task IDs
  [--ai-provider <provider>]         # AI provider override
  [--ai-model <model>]              # AI model override
  [--server <server>]               # Server/runtime override
  [--workdir <path>]                # Working directory override
  [--auto-start]                     # Start immediately after submit
  [--auto-pilot]                     # Run in auto-pilot mode (no human input)
  [--auto-close]                     # Auto-move to done on completion
  [--use-worktree]                  # Use git worktree for isolation
  [--use-memory]                    # Enable long-term memory
  [--start]                          # Start task immediately after submit (one-shot)
  [--wait]                           # Wait for completion (implies --start)
  [--json]
```

**IMPORTANT - Title vs Description:**

- **`<description>`** (main argument): The full task description or body text. Can be multi-line with details, acceptance criteria, etc.
- **`--title <title>`** (optional flag): A short, concise title shown in lists and boards. If omitted, the first 50 characters of `<description>` are used.

**IMPORTANT - Verify Lane Names/IDs First:**

Before using `--lane`, **always check what lanes exist**:

```bash
# ✓ List lanes to get exact names and IDs
tmux-agents kanban lanes --json
# Output: [{"id": "abc-123", "name": "backend", ...}]
```

**Best practices:**
- Use **lane ID** (more reliable, never changes): `--lane abc-123`
- Or use **exact lane name** (must match exactly): `--lane backend`
- **Never assume** lane names (e.g., "backend-api" vs "backend" vs "back-end")
- Wrong lane names create orphaned tasks that won't show in the correct swimlane

**Examples:**

```bash
# ✓ FIRST: Check what lanes exist (get exact names and IDs)
tmux-agents kanban lanes --json
# Output: [{"id": "3c71bace-...", "name": "backend"}]

# Simple task using lane name
tmux-agents task submit "Fix login bug" --lane backend --role coder

# Better: Use lane ID (no typos, never changes)
tmux-agents task submit "Fix login bug" --lane 3c71bace-0461-46bf-b176-5b96670cc8ee --role coder

# Complex task with title + detailed description
tmux-agents task submit "Bug: Login fails with 500 error when user session expires.
Need to add proper session validation, handle edge cases, and add error logging.

Acceptance criteria:
- Expired sessions return 401 with clear message
- No 500 errors on session expiry
- Audit log for failed auth attempts" \
  --title "Fix session expiry 500 error" \
  --lane backend --role coder --priority high

# Common mistakes (don't do these)
tmux-agents task submit "Fix bug" --description "Long description here"
# ❌ --description flag doesn't exist!
# ✓ Use: task submit "Long description here" --title "Fix bug"

tmux-agents task submit "Fix bug" --lane backend-api --role coder
# ❌ Assumed lane name without verifying! Might be "backend" not "backend-api"
# ✓ Run: tmux-agents kanban lanes first, verify exact name or use ID
```

### Update and move

```
task update <id>                      # Update task fields
  [-t|--title <title>]
  [-d|--description <text>]
  [-p|--priority <priority>]
  [-c|--column <column>]
  [-r|--role <role>]
  [-l|--lane <lane>]
  [-a|--assign <agentId>]
  [--tags <tags>]
  [--depends-on <ids>]
  [--ai-provider <provider>]
  [--ai-model <model>]
  [--server <server>]
  [--workdir <path>]
  [--auto-start] [--auto-pilot] [--auto-close]
  [--use-worktree] [--use-memory]
  [--json]
task move <id> <column>               # Move task to column
```

### Execute

```
task start <id> [--wait] [--json]     # Start task (spawns agent)
task stop <id>                        # Stop running task
task close <id>                       # Move to done
task cancel <id>                      # Cancel task
task delete <id>                      # Delete task permanently
```

### Monitor

```
task output <id> [-n|--lines <n>] [-f|--follow] [--json]
task watch <id> [--output] [--json]   # Watch task state changes
```

> **Note:** For running tasks, `task output` shows live progress reported by the agent via daemon heartbeats. The `output` field is updated every ~5 minutes with the agent's current phase, status summary, and files modified.

---

## kanban

Kanban board operations and swim lane management.

### Board

```
kanban                                # Show board (alias for kanban board)
kanban board [-l|--lane <lane>] [--json]
kanban tasks [-c|--column <column>] [-l|--lane <lane>] [--json]
```

### Task shortcuts (same as `task` commands)

```
kanban submit <description> [same flags as task submit]
kanban show <id> [--json]
kanban move <id> <column>
kanban update <id> [same flags as task update]
kanban start <taskId>
kanban stop <taskId>
kanban cancel <id>
kanban delete-task <id>
```

### Swim lanes

```
kanban lanes [--json]                 # List all swim lanes
kanban create-lane <name>
  [-w|--workdir <path>]              # Lane working directory
  [-p|--provider <provider>]         # Default AI provider for lane
  [--runtime <runtime>]             # Default runtime for lane
  [--wip-limit <n>]                 # Max concurrent tasks in lane
  [--priority <n>]                  # Lane priority (higher = first)
  [--auto-start]                    # Default: auto-start all tasks in this lane
  [--auto-pilot]                    # Default: auto-pilot all tasks in this lane
  [--auto-close]                    # Default: auto-close all tasks in this lane
  [--use-worktree]                  # Default: use git worktree for all tasks
  [--use-memory]                    # Default: enable memory for all tasks
  [--json]
kanban edit-lane <id>
  [-n|--name <name>]
  [-w|--workdir <path>]
  [-p|--provider <provider>]
  [-m|--model <model>]
  [--context <text>]                # Lane-specific context/instructions
  [--wip-limit <n>]
  [--priority <n>]
  [--auto-start]                    # Default: auto-start all tasks in this lane
  [--auto-pilot]                    # Default: auto-pilot all tasks in this lane
  [--auto-close]                    # Default: auto-close all tasks in this lane
  [--use-worktree]                  # Default: use git worktree for all tasks
  [--use-memory]                    # Default: enable memory for all tasks
  [--json]
kanban delete-lane <id>
```

---

## team

Manage agent teams.

```
team list [--json]                    # List all teams
team create <name>
  [--agents <json>]                  # Agent config JSON array
  [--workdir <path>]                # Team working directory
  [--runtime <runtime>]             # Team runtime
  [--json]
team delete <name>                    # Delete team
team add-agent <teamId> <agentId>     # Add agent to team
team remove-agent <teamId> <agentId>  # Remove agent from team

# Quick-start teams
team quick-code <workdir> [--runtime <runtime>] [--json]
team quick-research <topic> [--runtime <runtime>] [--json]
```

---

## pipeline

Multi-stage DAG pipeline execution.

```
pipeline list [--json]                # List all pipelines
pipeline active [--json]              # List active pipeline runs

pipeline create <name>
  [-d|--description <text>]
  [--stages <json>]                  # JSON array of stage definitions (MUST be single-quoted)
  [--json]
  # Stage format: {"name":"...", "role":"...", "prompt":"...", "dependencies":["..."]}
  # IMPORTANT: Always wrap JSON in single quotes to prevent shell interpretation:
  #   --stages '[{"name":"lint","role":"coder","prompt":"Run lint"}]'

pipeline run <id> [--json]            # Execute pipeline
pipeline status <runId> [--json]      # Get run status
pipeline pause <runId>                # Pause execution
pipeline resume <runId>               # Resume execution
pipeline cancel <runId>               # Cancel execution
```

---

## runtime

Configure execution runtimes.

```
runtime list [--json]                 # List configured runtimes
runtime add <name>
  --type <type>                      # tmux, ssh, docker, kubernetes
  [--host <host>]                   # SSH: user@hostname
  [--image <image>]                 # Docker/K8s: container image
  [--namespace <namespace>]         # K8s: namespace
runtime remove <name>                 # Remove runtime
runtime ping <id> [--json]            # Test runtime connectivity
```

---

## role

Define custom agent roles.

```
role list [--json]
role create <name>
  [--description <text>]
  [--prompt <text>]                  # System prompt for role
  [--json]
role update <id>
  [--name <name>]
  [--description <text>]
  [--prompt <text>]
  [--json]
role delete <id>
```

---

## backend

Backend integration and sync configuration.

```
backend list [--json]
backend status <name> [--json]
backend add <name>
  --type <type>                      # Backend type
  [--config <json>]                 # Backend-specific config
  [--json]
backend remove <name>
backend enable <name>                 # Enable sync
backend disable <name>                # Disable sync
backend sync [name] [--json]          # Trigger sync (all or specific)
backend retry-errors [name] [--json]  # Retry failed syncs
```

---

## fan-out

Dispatch a prompt to multiple agents simultaneously.

```
fan-out <prompt>
  [-n|--count <n>]                   # Number of agents to spawn
  [-p|--provider <provider>]         # AI provider
  [--runtime <runtime>]             # Runtime
  [--json]
```

---

## skill

Manage the tmux-agents Claude Code skill (install/uninstall to `~/.claude/skills/`).

```
skill install [-f|--force] [-p|--path <path>]   # Install skill (default: ~/.claude/skills/tmux-agents/)
skill uninstall [-p|--path <path>]               # Remove installed skill
skill list [--json] [-p|--path <path>]            # Show installed skill status
```

---

## Standalone Commands

```
dashboard [--json]                    # Full system overview
health [--json]                       # Daemon health check
tui [--socket <path>] [--ip <host:port>]  # Launch terminal UI
web [-p|--port <port>] [--host <host>]    # Launch web UI
completion <shell>                    # Generate shell completions (bash|zsh|fish)
```

### Remote Connection Flags

```
--ip <host:port>     # Connect to remote daemon (CLI, TUI)
                     # e.g. --ip 192.168.1.10:3456
                     # HTTP = host:port, WS = host:port+1

--socket <path>      # Use custom Unix socket path (TUI)
```

All commands that talk to the daemon accept `--ip` for remote connections:

```bash
tmux-agents task list --ip 10.0.1.5:3456
tmux-agents kanban show --ip 10.0.1.5:3456
tmux-agents agent list --ip 10.0.1.5:3456
tmux-agents tui --ip 10.0.1.5:3456
```

### Daemon Bind Address

```bash
daemon start --bind <address>   # Bind HTTP/WS to address (default: 127.0.0.1)
                                # Use 0.0.0.0 for remote access
```

---

## Global Notes

- All commands support `--json` for machine-readable output
- The daemon must be running for all commands except `daemon start/run`
- Agent and task IDs are unified — running tasks appear as agents. Use `agent list` or `task list` to find IDs; both accept the same IDs
- Columns: `backlog`, `todo`, `doing`, `review`, `done`
- Priorities: `low`, `medium`, `high`, `critical`
- Providers: `claude`, `gemini`, `codex`, `aider`, `opencode`, `cursor`, `copilot`, `amp`, `cline`, `kiro`

### Toggle Inheritance (Lane Defaults)

Swim lanes support **default toggles** that are automatically inherited by all tasks submitted to that lane. The inheritance priority is:

```
explicit task flag → swim lane default → false
```

Setting `--auto-start --auto-pilot --auto-close` on a lane means every task submitted to that lane will auto-start, run autonomously, and auto-close — without needing those flags on each `task submit`. Task-level flags always override lane defaults.

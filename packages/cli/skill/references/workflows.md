# tmux-agents Workflow Patterns

Common multi-step workflows for agent orchestration.

## Table of Contents

- [Kanban-Driven Development](#kanban-driven-development)
- [Team-Based Feature Work](#team-based-feature-work)
- [Pipeline CI/CD](#pipeline-cicd)
- [Fan-Out Code Review](#fan-out-code-review)
- [Multi-Runtime Deployment](#multi-runtime-deployment)
- [Swim Lane Project Organization](#swim-lane-project-organization)
- [Remote Daemon Connection](#remote-daemon-connection)
- [Monitoring and Recovery](#monitoring-and-recovery)
- [Troubleshooting Common Errors](#troubleshooting-common-errors)

---

## Kanban-Driven Development

Full lifecycle from task creation to completion with auto-pilot agents.

```bash
# 1. Ensure daemon is running
tmux-agents daemon start

# 2. Create a swim lane for the project
tmux-agents kanban create-lane myproject --workdir ~/dev/myproject --provider claude --wip-limit 3

# 3. Verify the lane was created and get its ID (best practice)
tmux-agents kanban lanes --json
# Output: [{"id": "abc-123-...", "name": "myproject", ...}]

# 4. Submit tasks to the lane
# Option A: Use lane name (must match exactly)
tmux-agents task submit "Add user authentication with JWT" \
  --lane myproject --role coder --priority high --auto-pilot --auto-close

# Option B: Use lane ID (more reliable, recommended)
tmux-agents task submit "Add user authentication with JWT" \
  --lane abc-123-456 --role coder --priority high --auto-pilot --auto-close

# Complex task with detailed description + short title
tmux-agents task submit "Write comprehensive unit tests for authentication module covering:
- JWT token generation and validation
- Password hashing and comparison
- Session management
- Edge cases (expired tokens, malformed tokens, missing claims)
Include integration tests with mock database." \
  --title "Write unit tests for auth module" \
  --lane myproject --role tester --priority medium --depends-on <auth-task-id>

tmux-agents task submit "Update API docs for auth endpoints" \
  --lane myproject --role coder --priority low --depends-on <auth-task-id>

# 5. Start the first task (dependents auto-start when ready)
tmux-agents task start <auth-task-id>

# 6. Monitor progress
tmux-agents kanban board --lane myproject
tmux-agents task watch <auth-task-id> --output
```

---

## Team-Based Feature Work

Spin up a coordinated team for a feature branch.

```bash
# Quick-start a coding team
tmux-agents team quick-code ~/dev/myproject

# Or create a custom team
tmux-agents team create feature-team \
  --workdir ~/dev/myproject \
  --agents '[
    {"role":"coder","provider":"claude","task":"Implement feature X"},
    {"role":"tester","provider":"claude","task":"Write tests for feature X"},
    {"role":"reviewer","provider":"gemini","task":"Review implementation"}
  ]'

# List team members
tmux-agents team list --json

# Send additional instructions to a team member
tmux-agents agent send <agent-id> "Also handle the edge case where input is empty"

# Monitor team output
tmux-agents agent output <agent-id> --follow
```

---

## Pipeline CI/CD

Create a multi-stage pipeline with dependency ordering.

```bash
# Define a build-test-deploy pipeline
tmux-agents pipeline create "release-pipeline" --stages '[
  {
    "name": "lint",
    "role": "coder",
    "prompt": "Run eslint and fix all errors in src/"
  },
  {
    "name": "unit-tests",
    "role": "tester",
    "prompt": "Run all unit tests and report failures",
    "dependencies": ["lint"]
  },
  {
    "name": "integration-tests",
    "role": "tester",
    "prompt": "Run integration test suite",
    "dependencies": ["lint"]
  },
  {
    "name": "security-scan",
    "role": "reviewer",
    "prompt": "Run security audit on dependencies and code",
    "dependencies": ["unit-tests"]
  },
  {
    "name": "deploy-staging",
    "role": "ops",
    "prompt": "Deploy to staging environment and verify health",
    "dependencies": ["unit-tests", "integration-tests", "security-scan"]
  }
]'

# Execute the pipeline
tmux-agents pipeline run <pipeline-id>

# Monitor execution (stages run in parallel where dependencies allow)
tmux-agents pipeline status <run-id>

# Pause/resume if needed
tmux-agents pipeline pause <run-id>
tmux-agents pipeline resume <run-id>
```

---

## Fan-Out Code Review

Send the same prompt to multiple agents for diverse perspectives.

```bash
# Fan out a code review to 3 agents
tmux-agents fan-out "Review the changes in the last commit for:
1. Security vulnerabilities
2. Performance issues
3. Code quality concerns
Provide a summary of findings." --count 3 --provider claude

# Check each agent's output
tmux-agents agent list --json | jq '.[].id'
tmux-agents agent output <agent-1-id>
tmux-agents agent output <agent-2-id>
tmux-agents agent output <agent-3-id>
```

---

## Multi-Runtime Deployment

Configure and use agents across different environments.

```bash
# Add runtimes
tmux-agents runtime add dev-box --type ssh --host dev@10.0.1.5
tmux-agents runtime add build-container --type docker --image node:20-slim
tmux-agents runtime add staging-cluster --type kubernetes --namespace agents

# Verify connectivity
tmux-agents runtime ping dev-box
tmux-agents runtime ping build-container
tmux-agents runtime ping staging-cluster

# Spawn agents on specific runtimes
tmux-agents agent spawn "Run load tests" --role tester --runtime dev-box
tmux-agents agent spawn "Build Docker image" --role ops --runtime build-container
tmux-agents agent spawn "Deploy to staging" --role ops --runtime staging-cluster

# All agents visible in the same dashboard
tmux-agents dashboard
```

---

## Swim Lane Project Organization

Organize a large project into isolated workstreams.

```bash
# Create lanes for each concern
tmux-agents kanban create-lane frontend \
  --workdir ~/dev/app/frontend --provider claude --wip-limit 3 --priority 10
tmux-agents kanban create-lane backend \
  --workdir ~/dev/app/backend --provider claude --wip-limit 2 --priority 10
tmux-agents kanban create-lane infra \
  --workdir ~/dev/app/infra --provider gemini --wip-limit 1 --priority 5
tmux-agents kanban create-lane docs \
  --workdir ~/dev/app --provider claude --wip-limit 2 --priority 1

# Add context to lanes
tmux-agents kanban edit-lane <frontend-id> \
  --context "React 19 app with TypeScript. Use functional components and hooks."
tmux-agents kanban edit-lane <backend-id> \
  --context "Node.js Express API with PostgreSQL. Follow REST conventions."

# Submit tasks to appropriate lanes
tmux-agents kanban submit "Add dark mode toggle" --lane frontend --role coder
tmux-agents kanban submit "Add rate limiting middleware" --lane backend --role coder
tmux-agents kanban submit "Set up CDN for static assets" --lane infra --role ops
tmux-agents kanban submit "Document API authentication flow" --lane docs --role coder

# View board filtered by lane
tmux-agents kanban board --lane frontend
tmux-agents kanban board --lane backend

# Start tasks (respects per-lane WIP limits)
tmux-agents kanban start <task-id>
```

---

## Fully Autonomous Lane (Auto-Start + Auto-Pilot + Build/Commit)

Set up a lane where every submitted task runs fully autonomously — auto-starts, requires no human input, builds/compiles, and commits on completion.

```bash
# 1. Create lane with auto-start, auto-pilot, auto-close defaults
tmux-agents kanban create-lane dev \
  --workdir ~/dev/myproject \
  --provider claude \
  --wip-limit 3 \
  --auto-start \
  --auto-pilot \
  --auto-close

# 2. Add context instructions (injected into every task in this lane)
#    Use --context to add build/compile/install/commit steps
tmux-agents kanban edit-lane <lane-id> \
  --context "After completing the main task, automatically:
1. Build the project (npm run compile)
2. Fix any build errors before proceeding
3. Stage changed files with git add (specific files only)
4. Commit with conventional commit format (feat:, fix:, refactor:, etc.)"

# 3. Submit tasks — they auto-start and run fully autonomously
#    No need for --auto-start --auto-pilot flags; inherited from lane defaults
tmux-agents kanban submit "Add input validation to login form" --lane dev --role coder
tmux-agents kanban submit "Fix race condition in websocket handler" --lane dev --role coder
tmux-agents kanban submit "Refactor database connection pooling" --lane dev --role coder

# 4. Monitor
tmux-agents kanban board --lane dev
tmux-agents task watch <task-id> --output
```

**Key points:**
- `--auto-start`, `--auto-pilot`, `--auto-close` on `create-lane` / `edit-lane` set **lane-level defaults**
- All tasks in the lane inherit these defaults automatically
- Task-level flags override lane defaults if explicitly set
- `--context` adds instructions that are injected into every agent spawned in the lane

---

## Heartbeat-Driven Autonomous Tasks

Submit tasks that report progress automatically via daemon heartbeats. Every 5 minutes, the daemon asks the agent for a status update. The agent responds with a structured progress marker, and the daemon stores it in the task's `output` field for live monitoring.

```bash
# 1. Create a fully autonomous lane
tmux-agents kanban create-lane auto-dev \
  --workdir ~/dev/myproject \
  --provider claude \
  --wip-limit 3 \
  --auto-start --auto-pilot --auto-close

# 2. Submit tasks — progress reporting is automatic for all started tasks
tmux-agents task submit "Refactor auth middleware to use async/await" \
  --lane auto-dev --role coder --priority high

# 3. Monitor live progress (updated every ~5 minutes via heartbeat)
tmux-agents task output <task-id>
# Shows:
#   Phase: Implementing feature
#   Status: Converted callback-based auth to async/await, fixing type errors
#   Files: src/middleware/auth.ts, src/middleware/session.ts

# 4. Watch for state changes (progress updates + completion)
tmux-agents task watch <task-id> --output

# 5. When the agent finishes, it signals DONE → task auto-completes
#    The tmux session is closed automatically (--auto-close)
tmux-agents kanban board --lane auto-dev
# Shows the task in "done" column with completion summary
```

**How it works:**
1. When a task starts, the prompt includes instructions for the agent to respond to heartbeats
2. Every 5 minutes, the daemon pastes a `[HEARTBEAT]` message into the agent's tmux pane
3. The agent outputs a `<task-progress>` marker with phase, status, and files
4. The daemon detects the marker and updates the task's `output` field
5. When done, the agent outputs `<promise>DONE</promise>` and the daemon completes the task

---

## Remote Daemon Connection

Connect clients to a daemon running on another machine.

```bash
# 1. On the REMOTE machine: start daemon bound to all interfaces
tmux-agents daemon start --bind 0.0.0.0

# 2. From LOCAL machine: connect CLI directly
tmux-agents task list --ip 192.168.1.10:3456
tmux-agents kanban board --ip 192.168.1.10:3456
tmux-agents agent list --ip 192.168.1.10:3456

# 3. Or launch TUI pointing at remote daemon
tmux-agents tui --ip 192.168.1.10:3456

# 4. For VS Code: set tmuxAgents.daemonUrl = "192.168.1.10:3456" in settings

# Alternative: SSH tunnel (more secure, daemon stays on 127.0.0.1)
ssh -L 3456:127.0.0.1:3456 -L 3457:127.0.0.1:3457 user@remote -N &
tmux-agents tui --ip localhost:3456
```

**Port convention:** HTTP port + 1 = WebSocket port (e.g., 3456 HTTP, 3457 WS).

---

## Monitoring and Recovery

Keep track of agent health and recover from failures. Since agents and tasks are unified, agent commands accept task IDs directly.

```bash
# System overview
tmux-agents dashboard

# Check for failed agents (shows running tasks as agents)
tmux-agents agent list --status error

# Get error details (use the task ID from agent list)
tmux-agents agent output <task-id> --lines 50

# Kill and respawn a stuck agent (use task ID)
tmux-agents agent kill <task-id>
tmux-agents task start <task-id>  # Respawns agent for the task

# Attach to an agent's tmux session (use task ID)
tmux-agents agent attach <task-id>

# Stop all tasks in a lane
tmux-agents kanban tasks --lane myproject --json | \
  jq -r '.[] | select(.column == "doing") | .id' | \
  xargs -I{} tmux-agents kanban stop {}

# Daemon health and stats
tmux-agents health
tmux-agents daemon stats

# Tail daemon logs for troubleshooting
tail -f ~/.tmux-agents/daemon.log

# Backend sync recovery
tmux-agents backend status mybackend
tmux-agents backend retry-errors mybackend
```

---

## Troubleshooting Common Errors

Quick fixes for the most frequent issues.

### Daemon connection refused

```bash
# Error: "connect ECONNREFUSED" or "Daemon not running"
# Fix: start the daemon first
tmux-agents daemon start
tmux-agents health  # should show "healthy"

# If daemon start fails, check if port is in use
lsof -i :3456
# Kill stale process if needed, then retry
```

### Task created but doesn't appear on board

```bash
# Usually caused by lane name mismatch
# 1. Check what lanes actually exist
tmux-agents kanban lanes --json

# 2. Verify your task's lane matches an existing lane
tmux-agents task list --json | jq '.[] | {id, lane, description}'

# 3. Use lane ID instead of name to avoid typos
tmux-agents task submit "Fix bug" --lane <exact-lane-id>
```

### Agent spawn fails silently

```bash
# Check daemon health first
tmux-agents health

# Check if tmux is installed and running
tmux -V       # needs 3.0+
tmux ls       # should not error

# Try spawning with explicit working directory
tmux-agents agent spawn "Test task" --role coder --workdir $(pwd) --provider claude
```

### JSON parse error on pipeline create

```bash
# ❌ Shell strips quotes from unquoted JSON
tmux-agents pipeline create test --stages [{"name":"lint"}]

# ✓ Always single-quote JSON arguments
tmux-agents pipeline create test --stages '[{"name":"lint","role":"coder","prompt":"Run lint"}]'

# ✓ Or use a file
cat stages.json | xargs -0 tmux-agents pipeline create test --stages
```

### Skill not found by Claude Code

```bash
# Check if skill is installed
tmux-agents skill list

# If not installed or outdated
tmux-agents skill install --force

# Verify the files exist
ls ~/.claude/skills/tmux-agents/
# Should show: SKILL.md, references/commands.md, references/workflows.md
```

### "Not yet implemented" errors

Some commands are registered but not yet functional:

| Command | Workaround |
|---------|-----------|
| `daemon run` | Use `daemon start --foreground` |
| `daemon logs` | Use `tail -f ~/.tmux-agents/daemon.log` |
| `agent output --follow` | Use `agent attach <id>` for live terminal |

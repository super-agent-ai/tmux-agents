# tmux-agents

**Run 10-50 AI agents in parallel from VS Code.**

Orchestrate Claude, Gemini, and Codex across tmux sessions with a Kanban board, auto-pilot, and real-time monitoring. Local and remote servers.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What it does

tmux-agents turns VS Code into a control plane for concurrent AI coding agents. Each agent runs in its own tmux pane. You manage them through a sidebar tree view, a Kanban board, or an AI chat interface.

```
  VS Code
  ┌──────────────────┬──────────────────────┐
  │  Sidebar         │  Kanban Board        │
  │                  │  ┌────┐┌────┐┌────┐  │
  │  local           │  │TODO││ WIP││DONE│  │
  │   ├ dev          │  │ T1 ││ T3 ││ T5 │  │
  │   │ ├ claude     │  │ T2 ││ T4 ││    │  │
  │   │ └ gemini     │  └────┘└────┘└────┘  │
  │   └ ops          ├──────────────────────┤
  │  remote          │  AI Chat             │
  │   └ prod         │  > start coding team │
  └──────────────────┴──────────────────────┘
        │                      │
   tmux sessions          task routing
        │                      │
   ┌────┴─────┐          ┌─────┴────┐
   │ claude   │          │ gemini   │  ...agents in
   │ codex    │          │ claude   │  tmux panes
   └──────────┘          └──────────┘
```

## Features

### Session management
- Tree view of all tmux sessions, windows, and panes
- One-click attach to any pane in the VS Code terminal
- Create, rename, delete sessions/windows/panes
- Smart terminal reuse (no duplicates)
- Hotkey system for instant pane switching (`Ctrl+Alt+T`)

### AI agent support
- Launch Claude, Gemini, or Codex sessions directly
- Real-time status detection: working / waiting / idle
- Fork existing AI sessions
- AI-powered session renaming based on pane content
- Activity rollup with priority coloring
- Configurable interactive and pipe commands per provider

### Multi-server
- Monitor local + remote servers simultaneously
- SSH config support (custom keys, ports, config files)
- Per-server session tree with connection testing
- Dynamic SSH server discovery via external script (daemon polling)

### Kanban board
- Drag-and-drop task management with 5 columns: Backlog, TODO, In Progress, In Review, Done
- **Swim lanes** map to tmux sessions with custom working directories
- **AI Generate**: describe a task in plain English, auto-generate structured task details (with blocking overlay and cancel)
- **Context instructions** per swim lane injected into every task prompt
- **Rich task prompts**: task ID, title, description, role, priority, and project context sent to AI agents
- Subtask splitting, merging, and parent-child relationships (Task Boxes)
- Bundle execution: launch multiple tasks in parallel across separate tmux windows
- Attach to running task windows directly from the board
- Restart tasks with full prompt context
- Import existing tmux sessions as tasks with AI-powered summaries

### Auto mode (per task)
- **Auto-start**: task launches automatically when moved to TODO
- **Auto-pilot**: monitors the agent and auto-responds "yes" to confirmation prompts
- **Auto-close**: detects completion signals, captures a summary, closes the tmux window, moves to Done

### Agent orchestration
- Agent templates with roles: coder, reviewer, tester, devops, researcher
- Team management: group agents, assign tasks
- Task routing: priority queue with role-based dispatch
- Pipeline engine: sequential, parallel, conditional, and fan-out stages
- Real-time dashboard with agent output monitoring

### AI chat
- Sidebar chat interface for natural language commands
- Backed by the full API catalog (50+ actions)
- "Just tell it what to do" and it executes tmux/orchestrator actions

## Quick start

### Prerequisites
- tmux installed (`brew install tmux` / `apt install tmux`)
- For AI agents: `claude`, `gemini`, or `codex` CLI tools installed

### Install
1. Open VS Code Extensions (`Cmd+Shift+X`)
2. Search for `tmux-agents`
3. Click **Install**

Or install from `.vsix`:
```sh
code --install-extension tmux-agents-0.1.0.vsix
```

### First steps

1. Click the tmux-agents icon in the Activity Bar
2. Your local tmux sessions appear in the tree view
3. Click the play button to attach to any session

To launch AI agents:
- Click the robot icon in the title bar to create a Claude session
- Or open the Kanban board (`Ctrl+Alt+K`) to manage tasks visually

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+T` | Hotkey jump |
| `Ctrl+Alt+N` | New tmux session |
| `Ctrl+Alt+C` | New Claude session |
| `Ctrl+Alt+K` | Open Kanban board |
| `Ctrl+Alt+D` | Open Dashboard |
| `Ctrl+Alt+G` | Open Pipeline Graph |
| `Ctrl+Alt+S` | Submit task |
| `Ctrl+Alt+A` | Focus AI Chat |
| `Ctrl+Alt+P` | Spawn agent |
| `Ctrl+Alt+E` | Create team |
| `Ctrl+Alt+F` | Fan-out task |
| `Ctrl+Alt+R` | Refresh |

## Configuration

In VS Code Settings (`tmuxAgents.*`):

| Setting | Default | Description |
|---|---|---|
| `sshServers` | `[]` | Remote SSH servers to monitor |
| `sshServersScript` | `""` | Path to script that outputs SSH server JSON array |
| `sshServersScript.interval` | `300` | Re-run interval for the script (seconds, min 10) |
| `sshServersScript.timeout` | `10` | Max wait for the script (seconds, 1-60) |
| `showLocalSessions` | `true` | Show local tmux sessions |
| `daemonRefresh.enabled` | `true` | Background auto-refresh |
| `daemonRefresh.lightInterval` | `10000` | Light refresh interval (ms) |
| `daemonRefresh.fullInterval` | `60000` | Full refresh interval (ms) |
| `paneCapture.enabled` | `true` | Capture pane content for AI detection |
| `paneCapture.lines` | `50` | Lines to capture per pane |
| `orchestrator.enabled` | `true` | Enable agent orchestrator |
| `orchestrator.pollingInterval` | `5000` | Agent polling interval (ms) |
| `orchestrator.autoDispatch` | `true` | Auto-dispatch tasks to idle agents |

### AI provider commands

Each provider (claude, gemini, codex) can be fully customized:

| Setting | Default | Description |
|---|---|---|
| `aiProviders.<provider>.command` | `claude` / `gemini` / `codex` | CLI binary for interactive tmux sessions |
| `aiProviders.<provider>.pipeCommand` | `claude` / `gemini` / `codex` | CLI binary for pipe mode (AI Generate, summaries) |
| `aiProviders.<provider>.args` | `""` | Extra arguments for launch |
| `aiProviders.<provider>.forkArgs` | `"--continue"` (claude) | Arguments for fork/continue |
| `aiProviders.<provider>.env` | `{}` | Environment variables as key-value pairs |

The `command` setting is used for interactive sessions in tmux windows. The `pipeCommand` setting is used for pipe mode operations (AI Generate, task summaries) where input is piped via stdin. This allows using different binaries or wrappers for each mode.

Example — Claude with custom binary and model flag:

```json
{
  "tmuxAgents.aiProviders.claude.command": "claude",
  "tmuxAgents.aiProviders.claude.pipeCommand": "claude",
  "tmuxAgents.aiProviders.claude.args": ["--model", "opus", "--verbose"],
  "tmuxAgents.aiProviders.claude.env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Example — Codex with custom binary and sandbox mode:

```json
{
  "tmuxAgents.aiProviders.codex.command": "codex",
  "tmuxAgents.aiProviders.codex.args": ["--approval-mode", "full-auto"]
}
```

Args accept both a string (`"--model opus"`) or an array (`["--model", "opus"]`).

The resulting tmux command will be: `ANTHROPIC_API_KEY=sk-ant-... claude --model opus --verbose`

### SSH server configuration

Static servers in settings:

```json
{
  "tmuxAgents.sshServers": [
    {
      "label": "Dev Box",
      "host": "dev.example.com",
      "user": "deploy",
      "identityFile": "~/.ssh/id_ed25519"
    }
  ]
}
```

Dynamic servers via script (daemon polling, non-blocking):

```json
{
  "tmuxAgents.sshServersScript": "~/.config/tmux-agents/servers.sh",
  "tmuxAgents.sshServersScript.interval": 300,
  "tmuxAgents.sshServersScript.timeout": 10
}
```

The script must output a JSON array to stdout:

```json
[
  { "label": "Dev Box", "host": "dev.example.com", "user": "deploy" },
  { "label": "Staging", "host": "staging.example.com" }
]
```

Servers from the script are merged with static `sshServers`. The script runs as a background daemon and only triggers a refresh when results change.

## Architecture

```
extension.ts          Main entry, command registration, webview handlers
tmuxService.ts        Tmux command execution (local + SSH)
serviceManager.ts     Multi-server service registry + SSH script daemon
aiAssistant.ts        AI provider detection, status parsing, spawn config
orchestrator.ts       Agent registry, task queue, dispatch loop
teamManager.ts        Agent team CRUD
taskRouter.ts         Role-based task routing
pipelineEngine.ts     Multi-stage pipeline execution
promptBuilder.ts      Shared prompt building for rich task context
database.ts           SQLite persistence (sql.js/WASM)
kanbanView.ts         Kanban board webview
dashboardView.ts      Agent dashboard webview
graphView.ts          Pipeline graph webview
chatView.ts           AI chat sidebar webview
apiCatalog.ts         50+ actions exposed to AI chat
agentTemplate.ts      Agent template management
types.ts              All shared interfaces and enums
commands/
  kanbanHandlers.ts   Kanban board message handlers
```

## Building from source

```sh
git clone https://github.com/super-agent-ai/tmux-agents.git
cd tmux-agents
npm install
make install
```

Or manually:

```sh
npm run compile
npx @vscode/vsce package --no-dependencies
code --install-extension tmux-agents-*.vsix
```

### Makefile targets

| Target | Description |
|---|---|
| `make compile` | Compile TypeScript |
| `make test` | Run tests |
| `make install` | Compile, package, and install the extension |
| `make clean` | Remove build artifacts |

## Logging

Extension logs are available in VS Code's Output panel under **Tmux Agents**. Open it via `View > Output` and select "Tmux Agents" from the dropdown.

## License

MIT

---

Built by [super-agent.ai](https://super-agent.ai)

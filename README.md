# tmux-agents

**Run 10-50 AI agents in parallel from VS Code.**

Orchestrate Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, and Kiro across tmux sessions with a Kanban board, auto-pilot, and real-time monitoring. Local and remote servers.

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
- Open terminals in editor area tabs or bottom panel (`smartAttachment.openInEditor`)
- Hotkey system for instant pane switching (`Ctrl+Alt+T`)

### AI agent support
- **10 providers**: Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro
- Per-pane AI status detection via tmux user options (`@cc_*`)
- Real-time status: working / waiting / idle with priority coloring
- Fork or resume existing AI sessions (provider-specific `resumeFlag`)
- AI-powered session renaming based on pane content
- Centralized model registry (`aiModels.ts`) with per-provider model lists
- Configurable default and fallback providers per swim lane
- Configurable interactive and pipe commands per provider

### Multi-server
- Monitor local + remote servers simultaneously
- SSH config file support (`-F` flag)
- Per-server session tree with connection testing
- Dynamic SSH server discovery via external script (daemon polling)

### Kanban board
- Drag-and-drop task management with 5 columns: Backlog, TODO, In Progress, In Review, Done
- **Swim lanes** map to tmux sessions with custom working directories
- **AI Generate**: describe a task in plain English, auto-generate structured task details (with blocking overlay and cancel)
- **Quick-add buttons**: per-swimlane plus button for instant task creation, AI-powered auto-add (red plus)
- **Context instructions** per swim lane injected into every task prompt
- **Long-term memory**: per-swimlane markdown memory files persisted across sessions
- **Git worktree support**: optional per-task worktree creation for isolated branches
- **Default toggles**: configure auto-start, auto-pilot, auto-close, and worktree defaults per swim lane; tasks inherit lane settings
- **Rich task prompts**: task ID, title, description, role, priority, and project context sent to AI agents
- Subtask splitting, merging, and parent-child relationships (Task Boxes)
- Bundle execution: launch multiple tasks in parallel across separate tmux windows
- Attach to running task windows directly from the board
- Restart tasks with full prompt context
- Import existing tmux sessions as tasks with AI-powered summaries
- Markdown rendering in card descriptions and summaries
- Orphaned task recovery (tasks from deleted lanes shown in default lane)
- Swimlane grouping by tags, dependencies, or dates

### Auto mode (per task)
- **Auto-start**: task launches automatically when moved to TODO
- **Auto-pilot**: monitors the agent and auto-responds "yes" to confirmation prompts
- **Auto-close**: detects completion signals (`<promise>...-DONE</promise>`), captures a summary, closes the tmux window, moves to Done
- Toggle inheritance: tasks inherit auto-mode defaults from their swim lane, with per-task overrides
- Session sync: automatically attaches unbound in-progress tasks to matching tmux windows

### Agent orchestration
- Agent templates with roles: coder, reviewer, tester, devops, researcher
- Team management: group agents, assign tasks
- Organizations and guilds for agent hierarchy
- Task routing: priority queue with role-based dispatch
- Pipeline engine: sequential, parallel, conditional, and fan-out stages
- Real-time dashboard with agent output monitoring and attach/detach toggle

### Default prompt templates
- Built-in prompt templates: Create Test Plans, Auto-Pass Tests, Install Plugins
- Templates loaded from `src/prompts/defaults.json` and can be disabled via `defaultPromptsEnabled`
- Execute from command palette or programmatically via `PromptExecutor`

### AI chat
- Sidebar chat interface for natural language commands
- Backed by the full API catalog (100+ actions)
- "Just tell it what to do" and it executes tmux/orchestrator actions

## Quick start

### Prerequisites
- **tmux** (`brew install tmux` on macOS, `apt install tmux` on Linux)
- **Node.js 18+** and **npm** (for building from source)
- **VS Code 1.85+**
- For AI agents: one or more CLI tools — `claude`, `gemini`, `codex`, `opencode`, `agent`, `copilot`, `aider`, `amp`, `cline`, or `kiro-cli`

### Install from source
```sh
git clone https://github.com/super-agent-ai/tmux-agents.git
cd tmux-agents
npm install
make install    # compiles, packages .vsix, installs into VS Code
```
Then reload VS Code (`Cmd+Shift+P` > "Developer: Reload Window").

### Install from .vsix
If you have a pre-built `.vsix` file:
```sh
code --install-extension tmux-agents-*.vsix
```

### First steps

1. Click the tmux-agents icon in the Activity Bar
2. Your local tmux sessions appear in the tree view
3. Click the play button to attach to any session

To launch AI agents:
- Click the robot icon in the title bar to create a Claude session
- Or open the Kanban board (`Ctrl+Alt+K`) to manage tasks visually

## Quick tips

- **Switch providers fast**: Set `tmuxAgents.defaultProvider` and `tmuxAgents.fallbackProvider` to your preferred tools. Swim lanes can override the default per-project.
- **Worktree isolation**: Enable the worktree toggle on a swim lane to give each task its own git worktree — no branch conflicts between parallel agents.
- **Memory files**: Add a `memoryFileId` to a swim lane to persist long-term context in a markdown file under the lane's working directory. Agents can read/write it across tasks.
- **Auto-mode pipeline**: Set all three toggles (auto-start, auto-pilot, auto-close) on a swim lane, then drag tasks to TODO — they launch, run unattended, and clean up automatically.
- **Bulk launch**: Select multiple tasks on the Kanban board and hit "Bundle Execute" to launch them in parallel across separate tmux windows.
- **AI Generate toggles**: When using AI Generate, the generated task inherits (and can modify) the swim lane's toggle defaults — no manual toggle setup needed.
- **Quick teams**: Use `Ctrl+Alt+Q` (coding team) or `Ctrl+Alt+W` (research team) to spin up a pre-configured multi-agent team in one step.
- **Pipe vs interactive**: The `command` setting launches interactive tmux sessions; `pipeCommand` is used for AI Chat, AI Generate, and summaries. Set them independently per provider if needed.
- **Default prompts**: Run "List Default Prompts" from the command palette to see built-in templates (test plans, auto-pass tests, install plugins). Disable with `defaultPromptsEnabled: false`.
- **Session sync**: When a swim lane's tmux session is actively attached, in-progress tasks automatically bind to matching windows — no manual attachment needed.

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
| `Ctrl+Alt+M` | Send prompt to agent |
| `Ctrl+Alt+L` | Create pipeline from description |
| `Ctrl+Alt+Q` | Quick: Start coding team |
| `Ctrl+Alt+W` | Quick: Start research team |
| `Ctrl+Alt+R` | Refresh |

## Configuration

All settings live under `tmuxAgents.*` and support nested objects:

```json
{
  "tmuxAgents.defaultProvider": "claude",
  "tmuxAgents.fallbackProvider": "gemini",
  "tmuxAgents.defaultPromptsEnabled": true,
  "tmuxAgents.sshServers": {
    "servers": [
      { "label": "mac-mini", "host": "mac-mini", "configFile": "~/.ssh/config" }
    ],
    "script": {
      "path": "~/.config/tmux-agents/servers.sh",
      "interval": 300,
      "timeout": 10
    }
  },
  "tmuxAgents.showLocalSessions": true,
  "tmuxAgents.daemonRefresh": {
    "enabled": true,
    "lightInterval": 10000,
    "fullInterval": 60000
  },
  "tmuxAgents.paneCapture": {
    "enabled": true,
    "lines": 50
  },
  "tmuxAgents.orchestrator": {
    "enabled": true,
    "pollingInterval": 5000,
    "autoDispatch": true
  },
  "tmuxAgents.aiProviders": {
    "claude": {
      "command": "claude",
      "pipeCommand": "claude",
      "args": ["--dangerously-skip-permissions"],
      "forkArgs": ["--continue"],
      "resumeFlag": "--resume",
      "defaultWorkingDirectory": "~/projects/my-app",
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

### Settings reference

| Setting | Default | Description |
|---|---|---|
| `defaultProvider` | `"claude"` | Default AI provider for tasks and swim lanes |
| `fallbackProvider` | `"gemini"` | Fallback provider when default is unavailable |
| `defaultPromptsEnabled` | `true` | Enable built-in prompt templates (test plans, auto-pass, install plugins) |
| `smartAttachment.openInEditor` | `true` | Open tmux terminals in editor area tabs instead of bottom panel |
| `sshServers.servers` | `[]` | Static SSH server list |
| `sshServers.script.path` | `""` | Script that outputs SSH server JSON array |
| `sshServers.script.interval` | `300` | Script re-run interval (seconds, min 10) |
| `sshServers.script.timeout` | `10` | Script timeout (seconds, 1-60) |
| `showLocalSessions` | `true` | Show local tmux sessions |
| `daemonRefresh.enabled` | `true` | Background auto-refresh |
| `daemonRefresh.lightInterval` | `10000` | Light refresh interval (ms) |
| `daemonRefresh.fullInterval` | `60000` | Full refresh interval (ms) |
| `paneCapture.enabled` | `true` | Capture pane content for AI detection |
| `paneCapture.lines` | `50` | Lines to capture per pane |
| `orchestrator.enabled` | `true` | Enable agent orchestrator |
| `orchestrator.pollingInterval` | `5000` | Agent polling interval (ms) |
| `orchestrator.autoDispatch` | `true` | Auto-dispatch tasks to idle agents |

### AI provider settings

Each provider (claude, gemini, codex, opencode, cursor, copilot, aider, amp, cline, kiro) supports:

| Setting | Default | Description |
|---|---|---|
| `command` | provider name | CLI binary for interactive tmux sessions |
| `pipeCommand` | same as `command` | CLI binary for pipe mode (AI Chat, AI Generate, summaries) |
| `args` | `[]` | Extra arguments for launch |
| `forkArgs` | `["--continue"]` (claude) | Arguments for fork/continue (no session ID) |
| `resumeFlag` | `"--resume"` | Flag to resume a specific session by ID (`command <resumeFlag> <sessionId>`) |
| `env` | `{}` | Environment variables |
| `defaultWorkingDirectory` | workspace folder | Working directory for pipe mode operations |
| `shell` | `false` | Run pipe commands through the system shell (enable for shell scripts) |

The `command` is used for interactive sessions in tmux windows. The `pipeCommand` is used for pipe mode operations where input is piped via stdin. This allows using different binaries for each mode.

### SSH server configuration

Static and script-based servers are unified under `tmuxAgents.sshServers`:

```json
{
  "tmuxAgents.sshServers": {
    "servers": [
      {
        "label": "Dev Box",
        "host": "dev.example.com",
        "user": "deploy",
        "configFile": "~/.ssh/config"
      }
    ],
    "script": {
      "path": "~/.config/tmux-agents/servers.sh",
      "interval": 300,
      "timeout": 10
    }
  }
}
```

The script must output a JSON array to stdout (same format as `servers`):

```json
[
  { "label": "Dev Box", "host": "dev.example.com", "user": "deploy" },
  { "label": "Staging", "host": "staging.example.com", "configFile": "~/.ssh/config" }
]
```

Static `servers` take precedence. The script runs as a background daemon and only triggers a refresh when results change.

**Server fields:** `label` (required), `host` (required), `user`, `port` (default 22), `configFile` (SSH `-F` flag), `enabled` (default true).

## Architecture

```
extension.ts          Main entry, command registration, webview handlers
tmuxService.ts        Tmux command execution (local + SSH)
serviceManager.ts     Multi-server service registry + SSH script daemon
aiAssistant.ts        AI provider detection, status parsing, spawn config
aiModels.ts           Centralized model registry for all providers
orchestrator.ts       Agent registry, task queue, dispatch loop
teamManager.ts        Agent team CRUD
organizationManager.ts  Organization unit hierarchy
guildManager.ts       Cross-org agent guilds
taskRouter.ts         Role-based task routing
pipelineEngine.ts     Multi-stage pipeline execution
promptBuilder.ts      Shared prompt building for rich task context
promptRegistry.ts     Template registry for default prompts
promptExecutor.ts     Prompt template execution engine
database.ts           SQLite persistence (sql.js/WASM)
kanbanView.ts         Kanban board webview
dashboardView.ts      Agent dashboard webview
graphView.ts          Pipeline graph webview
chatView.ts           AI chat sidebar webview
apiCatalog.ts         100+ actions exposed to AI chat
agentTemplate.ts      Agent template management
memoryManager.ts      Per-swimlane long-term memory file I/O
autoMonitor.ts        Auto-pilot monitoring (auto-start, auto-respond)
autoCloseMonitor.ts   Completion detection and tmux window cleanup
sessionSync.ts        Task-to-tmux-window attachment reconciliation
swimlaneGrouping.ts   Task grouping strategies (tags, dates, deps)
smartAttachment.ts    Terminal reuse strategies
hotkeyManager.ts      Hotkey binding system
activityRollup.ts     Activity aggregation for status display
processTracker.ts     Process categorization (building/testing/idle)
daemonRefresh.ts      Background refresh daemon
tmuxContextProvider.ts  Context gathering for AI agent prompts
types.ts              All shared interfaces and enums
commands/
  kanbanHandlers.ts   Kanban board message handlers
  sessionCommands.ts  Session management commands
  agentCommands.ts    Agent orchestration commands
```

## Development

```sh
git clone https://github.com/super-agent-ai/tmux-agents.git
cd tmux-agents
npm install
```

**Debug in VS Code:** Open the project, press `F5` to launch the Extension Development Host.

**Watch mode:** `make watch` recompiles on file changes.

**Run tests:** `make test` (550+ Vitest tests across 22 test files).

### Makefile targets

| Target | Description |
|---|---|
| `make compile` | Compile TypeScript to `out/` |
| `make test` | Run all Vitest tests |
| `make watch` | Watch mode — recompile on changes |
| `make package` | Compile and create `.vsix` file |
| `make install` | Compile, package, and install into VS Code |
| `make uninstall` | Remove the extension from VS Code |
| `make clean` | Delete `out/` and `.vsix` files |
| `make test-integration` | Run integration tests via vscode-test |
| `make test-all` | Run unit + integration tests |

## Logging

Extension logs are available in VS Code's Output panel under **Tmux Agents**. Open it via `View > Output` and select "Tmux Agents" from the dropdown.

## License

MIT

---

Built by [super-agent.ai](https://super-agent.ai)

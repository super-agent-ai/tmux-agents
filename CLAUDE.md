# CLAUDE.md

## Project Overview

**Tmux Agents** (`tmux-agents`) — a VS Code extension for AI agent orchestration via tmux. Manages 10-50 concurrent AI agents (Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro) across local and remote servers. Built by super-agent.ai.

## Build & Development

```bash
npm install              # Install dependencies
npm run compile          # Build (tsc + copy sql-wasm files to out/)
npm run watch            # Watch mode for development
```

To debug: open in VS Code, press F5 (runs "Run Extension" launch config).

Package for marketplace: `vsce package`

## Testing

```bash
npx vitest run              # Run all 498 tests (Vitest)
npx vitest run --no-coverage # Skip coverage
```

Tests live in `src/__tests__/` using Vitest (not Jest). Mock for `vscode` module is at `src/__tests__/__mocks__/vscode.ts`.

## Tech Stack

- TypeScript 5.8+ (strict mode), targeting ES2020 with CommonJS modules
- VS Code Extension API v1.85.0+
- sql.js (SQLite via WebAssembly) for persistence
- Node.js child_process for tmux/SSH command execution
- Vitest for unit testing

## Project Structure

```
src/
  extension.ts          # Main entry point — activate/deactivate, registers 40+ commands
  types.ts              # Shared interfaces, enums, type definitions
  tmuxService.ts        # Tmux CLI wrapper (local + SSH remote execution)
  serviceManager.ts     # Multi-server service management
  treeProvider.ts       # VS Code tree view (Server → Session → Window → Pane)
  database.ts           # SQLite persistence layer (sql.js)
  orchestrator.ts       # Agent state machine, task dispatch
  pipelineEngine.ts     # Multi-stage pipeline execution with dependency resolution
  taskRouter.ts         # Priority-based task routing
  teamManager.ts        # Agent team composition
  agentTemplate.ts      # Agent template definitions
  chatView.ts           # AI Chat webview — streaming CLI spawn, agentic tool loop, markdown rendering
  dashboardView.ts      # Dashboard webview for monitoring
  graphView.ts          # Pipeline graph visualization
  kanbanView.ts         # Kanban board webview
  aiAssistant.ts        # AI provider management — detection, launch commands, spawn config
  aiModels.ts           # Centralized model registry for all providers
  apiCatalog.ts         # Action catalog — registers 60+ actions, parses AI JSON responses, executes
  tmuxContextProvider.ts # Context gathering for AI agent prompts
  promptBuilder.ts      # Prompt construction for task bundles
  promptRegistry.ts     # Template registry for default prompts
  promptExecutor.ts     # Prompt template execution engine
  processTracker.ts     # Process categorization (building/testing/idle)
  activityRollup.ts     # Activity aggregation
  smartAttachment.ts    # Terminal reuse strategies
  hotkeyManager.ts      # Hotkey binding system
  daemonRefresh.ts      # Background refresh daemon
  memoryManager.ts      # Per-swimlane long-term memory file I/O
  autoMonitor.ts        # Auto-pilot monitoring (auto-start, auto-respond)
  autoCloseMonitor.ts   # Completion detection and tmux window cleanup
  sessionSync.ts        # Task-to-tmux-window attachment reconciliation
  swimlaneGrouping.ts   # Task grouping strategies (tags, dates, deps)
  organizationManager.ts # Organization unit hierarchy
  guildManager.ts       # Cross-org agent guilds
  commands/
    kanbanHandlers.ts   # Kanban webview message handlers (AI expand, summarize, scan)
    sessionCommands.ts  # Session management commands
    agentCommands.ts    # Agent orchestration commands
out/                    # Compiled JS + source maps + sql-wasm binaries
resources/              # Icons & assets
```

## AI Chat Architecture

The AI Chat (`chatView.ts`) spawns CLI tools (`claude`, `gemini`, `codex`) as child processes per message using `cp.exec`. No API keys needed — CLIs handle their own auth.

**Flow:**
1. User sends message → `handleUserMessage()`
2. Build prompt (system prompt + conversation history + file context)
3. `spawnStreaming()` — runs `claude --print --model opus -` via `cp.exec`, pipes prompt to stdin, streams stdout chunks to webview
4. On streamEnd, output is rendered as markdown
5. `runAgentLoop()` — parses JSON action blocks from output, executes via `ApiCatalog`, feeds results back, respawns CLI (up to 10 steps)

**Key patterns for child process spawning:**
- Always use `cp.exec` (not `cp.spawn`) — exec handles shell resolution reliably
- Always validate `cwd` with `safeCwd()` before passing to exec — invalid cwd causes misleading `spawn /bin/sh ENOENT`
- Defer `stdin.write` via `process.nextTick()` — prevents SIGPIPE if process fails to start
- SIGPIPE handler removed in `activate()` to prevent VS Code extension host crashes

## Architecture

**Layers:**
1. **Tmux abstraction** — `TmuxService` wraps CLI with 2s caching; `ServiceManager` handles multi-server SSH
2. **VS Code UI** — TreeProvider for sidebar, WebviewProviders for chat/dashboard/graph/kanban
3. **Orchestration** — `AgentOrchestrator` (state machine + dispatch), `PipelineEngine` (DAG execution), `TaskRouter` (priority routing)
4. **Persistence** — `Database` class wraps sql.js with deferred 500ms batch writes
5. **Intelligence** — `ProcessTracker` (50+ regex patterns), `AIAssistantManager` (provider detection/config)
6. **AI Chat** — `ChatViewProvider` (streaming CLI spawn, agentic tool loop, markdown rendering)

**Key patterns:** Event emitters for state changes, daemon polling (light 10s / full 60s), async/await throughout, service pattern for stateful classes.

**AI Providers:** Configured via `tmuxAgents.aiProviders` settings. Each provider has: `command`, `pipeCommand`, `args`, `forkArgs`, `autoPilotFlags`, `resumeFlag`, `env`, `defaultWorkingDirectory`, `shell`. `getSpawnConfig()` returns exec-ready config. Default/fallback providers configurable per swim lane.

## Coding Conventions

- **Classes:** PascalCase (`TmuxService`, `PipelineEngine`)
- **Interfaces/Enums:** PascalCase; enum values are UPPER_SNAKE_CASE (`ProcessCategory.BUILDING`)
- **Functions/variables:** camelCase
- **Private members:** `private` keyword; underscore prefix for EventEmitters (`_onDidChangeTreeData`)
- **Section comments:** `// ─── Section Name ──────────────────────────────`
- **Error handling:** try/catch with informative user-facing messages
- **No `any` types** except in sql.js wrapper
- Strict TypeScript enabled
- Comprehensive interfaces for all data models

## Key Entry Point

`src/extension.ts` exports `activate()` and `deactivate()`. Activation event: `onView:tmux-agents`. All commands, tree providers, webviews, and services are wired up in `activate()`.

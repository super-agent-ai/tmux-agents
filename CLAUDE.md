# CLAUDE.md

## Project Overview

**Tmux Agents** (`tmux-agents`) — a daemon-based AI agent orchestration platform with multiple client interfaces. Manages 10-50 concurrent AI agents (Claude, Gemini, Codex, OpenCode, Cursor, Copilot, Aider, Amp, Cline, Kiro) across local tmux, remote SSH servers, Docker containers, and Kubernetes pods.

Built by super-agent.ai

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Client Layer                          │
│  ┌─────────────┐ ┌────────┐ ┌──────┐ ┌───────────────┐  │
│  │  VS Code    │ │  CLI   │ │ TUI  │ │  MCP Server   │  │
│  │  Extension  │ │        │ │      │ │ (Claude.app)  │  │
│  └──────┬──────┘ └───┬────┘ └───┬──┘ └───────┬───────┘  │
└─────────┼────────────┼──────────┼─────────────┼──────────┘
          │            │          │             │
    ┌─────┴────────────┴──────────┴─────────────┴───────┐
    │         Transport Layer (JSON-RPC 2.0)            │
    │  • Unix Socket (~/.tmux-agents/daemon.sock)       │
    │  • HTTP Fallback (localhost:3456)                 │
    │  • WebSocket Events (localhost:3457)              │
    └───────────────────────┬───────────────────────────┘
                            │
    ┌───────────────────────▼───────────────────────────┐
    │              Daemon Layer                         │
    │  ┌─────────────────────────────────────────────┐  │
    │  │  API Layer (JSON-RPC handler)               │  │
    │  └─────────────────┬───────────────────────────┘  │
    │  ┌─────────────────▼───────────────────────────┐  │
    │  │  Service Layer                              │  │
    │  │  • AgentOrchestrator (state machine)        │  │
    │  │  • PipelineEngine (DAG execution)           │  │
    │  │  • TaskRouter (priority routing)            │  │
    │  │  • TeamManager (team coordination)          │  │
    │  └─────────────────┬───────────────────────────┘  │
    │  ┌─────────────────▼───────────────────────────┐  │
    │  │  Persistence Layer (SQLite)                 │  │
    │  │  Database (~/.tmux-agents/tmux-agents.db)   │  │
    │  └─────────────────┬───────────────────────────┘  │
    └────────────────────┼───────────────────────────────┘
                         │
    ┌────────────────────▼───────────────────────────────┐
    │              Runtime Layer                         │
    │  ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
    │  │   Tmux    │ │  Docker  │ │   Kubernetes     │  │
    │  │ Runtime   │ │ Runtime  │ │    Runtime       │  │
    │  │ (local +  │ │          │ │                  │  │
    │  │   SSH)    │ │          │ │                  │  │
    │  └───────────┘ └──────────┘ └──────────────────┘  │
    └────────────────────────────────────────────────────┘
```

### Key Abstraction: All Runtimes Use Tmux

All runtimes (local, SSH, Docker, K8s) execute agents inside tmux sessions. The only difference is the **exec prefix**:

- **Local**: `tmux` (direct execution)
- **SSH**: `ssh user@host -- tmux` (remote execution)
- **Docker**: `docker exec <container-id> tmux` (containerized execution)
- **K8s**: `kubectl exec -n <namespace> <pod> -- tmux` (pod execution)

This unified abstraction allows the same `TmuxService` class to manage all agent types.

---

## Monorepo Structure

```
tmux-agents/                         # Monorepo root
├── src/                             # Main VS Code extension + shared core
│   ├── extension.ts                 # VS Code extension entry point
│   ├── core/                        # Core business logic (shared)
│   │   ├── types.ts                 # Shared TypeScript interfaces
│   │   ├── tmuxService.ts           # Tmux CLI wrapper
│   │   ├── database.ts              # SQLite persistence layer
│   │   ├── eventBus.ts              # Event emitter system
│   │   ├── config.ts                # Configuration management
│   │   ├── processTracker.ts       # Process categorization (50+ regex patterns)
│   │   └── index.ts                 # Core exports
│   ├── orchestrator.ts              # Agent state machine & dispatch
│   ├── pipelineEngine.ts            # Multi-stage DAG pipeline execution
│   ├── taskRouter.ts                # Priority-based task routing
│   ├── teamManager.ts               # Agent team composition
│   ├── agentTemplate.ts             # Agent template definitions
│   ├── aiAssistant.ts               # AI provider management (detection, launch)
│   ├── aiModels.ts                  # Centralized model registry
│   ├── apiCatalog.ts                # 100+ action catalog for AI responses
│   ├── tmuxContextProvider.ts       # Context gathering for AI prompts
│   ├── promptBuilder.ts             # Prompt construction
│   ├── promptRegistry.ts            # Template registry
│   ├── promptExecutor.ts            # Template execution engine
│   ├── treeProvider.ts              # VS Code tree view provider
│   ├── chatView.ts                  # AI Chat webview (streaming, tool loop)
│   ├── dashboardView.ts             # Dashboard webview
│   ├── graphView.ts                 # Pipeline graph visualization
│   ├── kanbanView.ts                # Kanban board webview
│   ├── autoMonitor.ts               # Auto-pilot monitoring
│   ├── autoCloseMonitor.ts          # Completion detection & cleanup
│   ├── memoryManager.ts             # Per-swimlane long-term memory
│   ├── sessionSync.ts               # Task-to-tmux reconciliation
│   ├── swimlaneGrouping.ts          # Task grouping strategies
│   ├── hotkeyManager.ts             # Hotkey binding system
│   ├── daemonRefresh.ts             # Background refresh daemon
│   └── __tests__/                   # Test suites (653/661 tests)
├── packages/                        # Client packages (npm workspaces)
│   ├── cli/                         # Command-line interface
│   │   ├── src/
│   │   │   ├── cli/                 # CLI implementation
│   │   │   │   ├── index.ts         # CLI entry point (bin)
│   │   │   │   ├── commands/        # Command handlers
│   │   │   │   └── formatters/      # Output formatters
│   │   │   ├── client/              # DaemonClient (shared)
│   │   │   ├── core/                # Core logic (copied from src/core/)
│   │   │   └── __tests__/           # CLI tests (15 tests)
│   │   ├── dist/                    # Compiled output (npm publish)
│   │   ├── package.json             # CLI package config
│   │   ├── tsconfig.json            # TypeScript config (ESM, Node16)
│   │   └── vitest.config.ts         # Test config
│   ├── tui/                         # Terminal UI (React + Ink)
│   │   ├── src/
│   │   │   ├── tui/                 # TUI implementation
│   │   │   │   ├── index.tsx        # TUI entry point
│   │   │   │   ├── components/      # React components
│   │   │   │   ├── hooks/           # Custom hooks
│   │   │   │   ├── settings/        # Settings management
│   │   │   │   └── util/            # Utilities
│   │   │   ├── client/              # DaemonClient (shared)
│   │   │   └── __tests__/           # TUI tests (31 tests)
│   │   ├── dist/                    # Compiled output
│   │   ├── package.json             # TUI package config ("type": "module")
│   │   ├── tsconfig.json            # TypeScript config (ESM, Node16, jsx)
│   │   └── vitest.config.ts         # Test config
│   ├── mcp/                         # MCP server for Claude Desktop
│   │   ├── src/
│   │   │   ├── server.ts            # MCP server entry point
│   │   │   ├── tools.ts             # Tool definitions & handlers
│   │   │   ├── prompts.ts           # Prompt templates
│   │   │   ├── resources.ts         # Resource providers
│   │   │   ├── formatters.ts        # Output formatters
│   │   │   ├── client/              # DaemonClient (shared)
│   │   │   └── __tests__/           # MCP tests (55 tests)
│   │   ├── dist/                    # Compiled output
│   │   ├── package.json             # MCP package config ("type": "module")
│   │   ├── tsconfig.json            # TypeScript config (ESM, Node16)
│   │   └── vitest.config.ts         # Test config
│   └── k8s-runtime/                 # Kubernetes runtime
│       ├── src/
│       │   ├── runtimes/            # K8s runtime implementation
│       │   │   ├── index.ts         # Runtime exports
│       │   │   ├── types.ts         # Runtime abstraction types
│       │   │   ├── k8sRuntime.ts    # Main K8s runtime class
│       │   │   ├── k8sPool.ts       # Warm agent pool
│       │   │   └── k8sWatcher.ts    # Pod event watcher
│       │   ├── core/                # Core logic (copied from src/core/)
│       │   └── __tests__/           # K8s tests (require cluster)
│       ├── dist/                    # Compiled output
│       ├── package.json             # K8s package config ("type": "module")
│       ├── tsconfig.json            # TypeScript config (ESM, Node16)
│       └── vitest.config.ts         # Test config
├── out/                             # Main extension compiled output
├── package.json                     # Root package (npm workspaces)
├── tsconfig.json                    # Root TypeScript config
├── vitest.config.ts                 # Root test config
├── README.md                        # User documentation
├── CLAUDE.md                        # This file (developer reference)
├── COMPLETION_REPORT.md             # Refactoring completion status
└── REFACTORING_STATUS.md            # Package build & test status
```

---

## Build & Development

### Prerequisites

- Node.js 18+
- TypeScript 5.8+
- tmux 3.0+ (for local/SSH runtimes)
- Docker (optional, for container runtime)
- kubectl (optional, for K8s runtime)

### Installation

```bash
# Clone repo
git clone https://github.com/super-agent-ai/tmux-agents
cd tmux-agents

# Install dependencies (installs for all workspaces)
npm install
```

### Build

```bash
# Build main extension
npm run compile

# Build all workspace packages
npm run compile --workspaces

# Build specific package
npm run build -w packages/cli
npm run build -w packages/tui
npm run build -w packages/mcp
npm run build -w packages/k8s-runtime

# Watch mode (auto-rebuild on changes)
npm run watch
npm run watch -w packages/cli
```

### Testing

```bash
# Run main extension tests
npm test                     # 653/661 tests (Vitest)

# Run all workspace tests
npm test --workspaces        # All package tests

# Run specific package tests
npm test -w packages/cli     # 15/15 tests
npm test -w packages/tui     # 31/31 tests
npm test -w packages/mcp     # 55/55 tests

# Skip coverage (faster)
npm test -- --no-coverage

# Watch mode
npm test -- --watch
```

**Current test status: 754/762 tests passing (98.9%)**

Failures:
- 8 Docker integration tests (requires Docker daemon)
- K8s runtime tests (requires K8s cluster)

### Debugging

```bash
# Debug VS Code extension
# Open in VS Code, press F5 (runs "Run Extension" launch config)

# Debug daemon with inspector
node --inspect out/daemon/index.js

# Verbose logging
DEBUG=tmux-agents:* npx tmux-agents daemon start

# View logs
tail -f ~/.tmux-agents/daemon.log
```

---

## Tech Stack

### Core

- **TypeScript 5.8+** (strict mode, ES2020 target)
- **Node.js 18+** (ESM modules with .js extensions required)
- **sql.js** (SQLite via WebAssembly for persistence)
- **child_process** (tmux/SSH/Docker/kubectl command execution)

### VS Code Extension

- **VS Code Extension API v1.85.0+**
- **Webview API** (for chat, dashboard, graph, kanban views)
- **TreeView API** (for sidebar agent/task/pipeline tree)

### CLI Package

- **Commander.js** (command parsing)
- **DaemonClient** (JSON-RPC 2.0 client, Unix socket + HTTP fallback)

### TUI Package

- **React 19** (UI components)
- **Ink v6** (React renderer for CLI, **ESM-only**)
- **ink-text-input** (text input component)
- **ink-testing-library** (testing utilities)

### MCP Package

- **@modelcontextprotocol/sdk** (MCP protocol, **ESM-only**)
- **DaemonClient** (connects to daemon via Unix socket)

### K8s Runtime Package

- **@kubernetes/client-node v0.22.0** (Kubernetes API client)
- **TmuxService** (tmux abstraction with `kubectl exec` prefix)

### Testing

- **Vitest 2.0+** (test runner, **not Jest**)
- **@testing-library/react** (React component testing)
- **happy-dom** (DOM implementation for Vitest)

---

## Key Technical Patterns

### 1. ESM with Node16 Module Resolution

All packages use ES Modules with Node16/nodenext module resolution:

```typescript
// package.json
{
  "type": "module"  // Required for ESM
}

// tsconfig.json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "node16"
  }
}

// IMPORTANT: All imports MUST include .js extensions
import { TmuxService } from './tmuxService.js';  // ✅ Correct
import { TmuxService } from './tmuxService';     // ❌ Wrong (will fail)
```

**Why .js extensions?**
- Node16/nodenext module resolution requires explicit file extensions
- TypeScript emits .js files but doesn't rewrite imports
- You must use .js even when importing .ts files

### 2. DaemonClient Shared Library

All clients (CLI, TUI, MCP, VS Code) use the same `DaemonClient` for daemon communication:

```typescript
// packages/*/src/client/daemonClient.ts
export class DaemonClient {
  async connect(): Promise<void> {
    // Try Unix socket first, fallback to HTTP
  }

  async call(method: string, params?: any): Promise<any> {
    // JSON-RPC 2.0 request
  }

  subscribe(event: string, handler: EventHandler): void {
    // WebSocket event subscription
  }
}
```

**Transport priority:**
1. Unix socket (`~/.tmux-agents/daemon.sock`) - fastest, most reliable
2. HTTP (`http://localhost:3456`) - fallback when socket unavailable
3. WebSocket (`ws://localhost:3457`) - for event subscriptions

### 3. JSON-RPC 2.0 Protocol

All client-daemon communication uses JSON-RPC 2.0:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "agent.spawn",
  "params": {
    "role": "coder",
    "task": "Fix bug #123"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "id": "agent-abc123",
    "status": "spawned"
  }
}
```

**Error:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32603,
    "message": "Agent spawn failed",
    "data": { "reason": "tmux session creation failed" }
  }
}
```

### 4. Runtime Abstraction

All runtimes implement the same `AgentRuntime` interface:

```typescript
export interface AgentRuntime {
  type: 'tmux' | 'docker' | 'kubernetes';

  spawnAgent(config: AgentConfig): Promise<AgentHandle>;
  killAgent(handle: AgentHandle): Promise<void>;
  listAgents(): Promise<AgentInfo[]>;
  getOutput(handle: AgentHandle): Promise<string>;
  ping(): Promise<void>;
}
```

Each runtime uses `TmuxService` internally with a different exec prefix:
- `TmuxRuntime`: `new TmuxService('')`
- `DockerRuntime`: `new TmuxService('docker exec <cid>')`
- `K8sRuntime`: `new TmuxService('kubectl exec <pod> -n <ns> --')`

### 5. Event-Driven Architecture

Components communicate via EventBus:

```typescript
// Emit event
eventBus.emit('agent.created', { agentId: 'abc123', ... });

// Subscribe to event
eventBus.on('agent.created', (event) => {
  console.log('Agent created:', event.agentId);
});

// Event types
type EventType =
  | 'agent.created'
  | 'agent.state_changed'
  | 'agent.output'
  | 'task.created'
  | 'task.assigned'
  | 'task.completed'
  | 'pipeline.started'
  | 'pipeline.stage_completed'
  | 'pipeline.completed';
```

### 6. Database Persistence

SQLite database (`~/.tmux-agents/tmux-agents.db`) with deferred batch writes:

```typescript
// Database schema
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  role TEXT,
  status TEXT,
  runtime TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT,
  status TEXT,
  priority INTEGER,
  assigned_to TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE pipelines (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  stages TEXT, -- JSON
  created_at INTEGER,
  updated_at INTEGER
);
```

Batch write strategy:
- Collect writes in memory
- Flush to disk every 500ms or on 100 pending writes
- Prevents disk I/O bottlenecks

### 7. AI Provider Abstraction

AI providers configured via `aiAssistant.ts`:

```typescript
interface ProviderConfig {
  command: string;           // e.g., 'claude'
  pipeCommand?: string;      // Pipe mode variant
  args: string[];            // e.g., ['--print', '--model', 'opus']
  forkArgs?: string[];       // Fork mode args
  autoPilotFlags?: string[]; // Auto-pilot specific flags
  resumeFlag?: string;       // Resume flag for existing sessions
  env?: Record<string, string>;
  defaultWorkingDirectory?: string;
  shell?: string;
}
```

Spawn process with provider:
```typescript
const config = getSpawnConfig(provider, { model: 'opus', ... });
const process = cp.exec(config.command, { cwd: config.cwd, env: config.env });
```

### 8. Testing Patterns

**Vitest configuration (not Jest):**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '**/*.js', 'dist/**'],
  },
});
```

**Mocking VS Code API:**

```typescript
// src/__tests__/__mocks__/vscode.ts
export const window = {
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  createTreeView: vi.fn(),
};

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};
```

**Testing React components (TUI):**

```typescript
import { render } from 'ink-testing-library';
import { StatusBar } from '../components/StatusBar.js';

it('displays agent counts', () => {
  const { lastFrame } = render(<StatusBar agents={mockAgents} />);
  expect(lastFrame()).toContain('2 active');
});
```

---

## Coding Conventions

### TypeScript

- **Strict mode** enabled
- **No `any` types** except in sql.js wrapper
- **Explicit return types** on public methods
- **Interface-first** design for all data models

### Naming

- **Classes**: PascalCase (`TmuxService`, `PipelineEngine`)
- **Interfaces**: PascalCase (`AgentInfo`, `TaskConfig`)
- **Enums**: PascalCase, values UPPER_SNAKE_CASE (`ProcessCategory.BUILDING`)
- **Functions/variables**: camelCase
- **Private members**: `private` keyword + underscore for event emitters (`_onDidChangeTreeData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)

### File Organization

**Section comments:**
```typescript
// ─── Section Name ──────────────────────────────────────
```

**Import order:**
1. Node.js built-ins (`import * as fs from 'fs';`)
2. External dependencies (`import { Command } from 'commander';`)
3. Internal imports (`import { TmuxService } from './tmuxService.js';`)

### Error Handling

```typescript
try {
  await operation();
} catch (err: any) {
  // Log error
  console.error('Operation failed:', err.message);

  // Show user-friendly message
  vscode.window.showErrorMessage(`Failed to ${action}: ${err.message}`);

  // Rethrow if caller needs to handle
  throw new Error(`${context}: ${err.message}`);
}
```

### Git Commits

Use Conventional Commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

---

## Key Components

### AgentOrchestrator

State machine for agent lifecycle:

```
          ┌─────────┐
    ┌────►│  IDLE   │────┐
    │     └─────────┘    │
    │                    │ spawn
    │                    ▼
┌───┴──────┐      ┌──────────┐
│COMPLETED │◄─────│ WORKING  │
└──────────┘      └────┬─────┘
                       │
                       │ error
                       ▼
                  ┌─────────┐
                  │  ERROR  │
                  └─────────┘
```

### PipelineEngine

DAG-based multi-stage execution:

```typescript
interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface PipelineStage {
  name: string;
  role: string;
  prompt: string;
  dependencies: string[]; // Stage names this depends on
}
```

Execution:
1. Topological sort of stages
2. Execute stages with satisfied dependencies
3. Pass artifacts between stages
4. Rollback on stage failure

### TaskRouter

Priority-based task assignment:

```typescript
interface RoutingRule {
  condition: {
    tags?: string[];
    priority?: [number, number]; // [min, max]
  };
  assignTo: {
    team?: string;
    role?: string;
    skills?: string[];
  };
}
```

### TmuxService

Tmux CLI wrapper with caching:

```typescript
class TmuxService {
  constructor(execPrefix: string) {
    // execPrefix examples:
    // '' - local
    // 'ssh user@host --' - remote
    // 'docker exec abc123' - container
    // 'kubectl exec pod -n ns --' - pod
  }

  async listSessions(): Promise<TmuxSession[]> {
    // Cached for 2s to prevent CLI spam
  }

  async sendKeys(session: string, keys: string): Promise<void> {
    // Send keys to tmux session
  }

  async capturePane(session: string): Promise<string> {
    // Get pane output
  }
}
```

---

## Common Tasks

### Adding a New CLI Command

1. Create command handler in `packages/cli/src/cli/commands/`:

```typescript
// packages/cli/src/cli/commands/myCommand.ts
import { Command } from 'commander';
import { DaemonClient } from '../../client/daemonClient.js';

export function registerMyCommand(program: Command, client: DaemonClient) {
  program
    .command('my-command')
    .description('Do something cool')
    .option('--foo <value>', 'Foo option')
    .action(async (options) => {
      const result = await client.call('my.method', options);
      console.log(result);
    });
}
```

2. Register in `packages/cli/src/cli/index.ts`:

```typescript
import { registerMyCommand } from './commands/myCommand.js';
registerMyCommand(program, client);
```

3. Add tests in `packages/cli/src/__tests__/cli/myCommand.test.ts`

### Adding a New MCP Tool

1. Define tool schema in `packages/mcp/src/tools.ts`:

```typescript
const MyToolSchema = z.object({
  param1: z.string(),
  param2: z.number().optional(),
});

export const tools = [
  {
    name: 'my_tool',
    description: 'Do something via MCP',
    inputSchema: MyToolSchema
  },
  // ... other tools
];
```

2. Add handler:

```typescript
async function handleMyTool(args: any, client: DaemonClient): Promise<string> {
  const result = await client.call('my.method', args);
  return formatSuccess('Operation completed', result);
}

export async function handleTool(name: string, args: any, client: DaemonClient) {
  switch (name) {
    case 'my_tool':
      return await handleMyTool(args, client);
    // ... other tools
  }
}
```

3. Add tests in `packages/mcp/src/__tests__/tools.test.ts`

### Adding a New Runtime

1. Implement `AgentRuntime` interface in `src/runtimes/`:

```typescript
export class MyRuntime implements AgentRuntime {
  readonly type = 'my-runtime';

  async spawnAgent(config: AgentConfig): Promise<AgentHandle> {
    // Create tmux with your exec prefix
    const tmux = new TmuxService('my-runtime-exec-prefix');
    // ... spawn logic
  }

  async killAgent(handle: AgentHandle): Promise<void> { }
  async listAgents(): Promise<AgentInfo[]> { }
  async getOutput(handle: AgentHandle): Promise<string> { }
  async ping(): Promise<void> { }
}
```

2. Register in runtime manager
3. Add tests

---

## Troubleshooting Development Issues

### TypeScript Error: "Cannot find module" with .js extension

**Problem**: Import with `.js` extension fails in IDE but builds fine.

**Solution**: This is expected. TypeScript compiles `.ts` → `.js` but doesn't rewrite imports. The `.js` extension is required for runtime ES module resolution. Your IDE may show errors but the code works.

### Vitest: "exports is not defined"

**Problem**: Test files fail with "exports is not defined in ES module scope".

**Solution**: Compiled `.js` files are being loaded instead of `.ts` source files. Check:
1. `vitest.config.ts` excludes `**/*.js` and `dist/**`
2. No `.js` files exist in `src/` directory
3. Remove with: `find src -name "*.js" -delete`

### Package build creates .js files in src/

**Problem**: TypeScript compiles to `src/` instead of `dist/`.

**Solution**: Check `tsconfig.json`:
```json
{
  "compilerOptions": {
    "outDir": "dist",  // Must be dist, not src
    "rootDir": "src"   // Optional but recommended
  }
}
```

### K8s client API type errors

**Problem**: Kubernetes client-node API signatures don't match.

**Solution**: We updated to v0.22.0 which changed from object params to positional params:
```typescript
// Old (v0.21.0)
await api.createNamespacedPod({ namespace, body: podSpec });

// New (v0.22.0)
await api.createNamespacedPod(namespace, podSpec);
```

Also response structure changed:
```typescript
// Old
const pod = await api.readNamespacedPod({ name, namespace });
const phase = pod.status?.phase;

// New
const response = await api.readNamespacedPod(name, namespace);
const phase = response.body.status?.phase;
```

---

## Performance Considerations

### TmuxService Caching

`listSessions()` is cached for 2 seconds to prevent CLI spam:
- First call executes `tmux ls`
- Subsequent calls within 2s return cached data
- Cache invalidated on write operations (`sendKeys`, `newSession`, etc.)

### Database Batch Writes

SQLite writes are batched:
- Buffer writes in memory
- Flush every 500ms OR on 100 pending writes
- Prevents disk I/O bottlenecks on high agent counts

### Event Subscription

WebSocket events are opt-in:
- Clients must explicitly subscribe to events
- Only subscribed events are sent over WebSocket
- Prevents bandwidth waste on unused events

---

## Resources

- **User Guide**: [README.md](README.md)
- **Refactoring Status**: [COMPLETION_REPORT.md](COMPLETION_REPORT.md)
- **Package Status**: [REFACTORING_STATUS.md](REFACTORING_STATUS.md)
- **Website**: https://super-agent.ai
- **Issues**: https://github.com/super-agent-ai/tmux-agents/issues

---

**Last Updated**: 2026-02-13
**Test Status**: 754/762 passing (98.9%)

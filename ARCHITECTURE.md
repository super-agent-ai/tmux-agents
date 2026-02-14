# tmux-agents Shared Component Architecture

**Version:** 1.0
**Date:** 2026-02-14
**Status:** Active Development

## Overview

tmux-agents uses a **shared core architecture** where business logic, types, and data management are centralized in the `core` package, while UI-specific implementations (VSCode Extension, TUI, Web UI, CLI) consume this core functionality.

This architecture ensures that **new features added to the daemon are automatically available to all UIs** with minimal duplication.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          User Interfaces                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   VS Code    │  │  Terminal UI │  │   Web UI     │         │
│  │  Extension   │  │    (Ink)     │  │ (HTML/CSS/JS)│         │
│  │              │  │              │  │              │         │
│  │  Webviews    │  │  Components  │  │   Pages      │         │
│  │  - Kanban    │  │  - Kanban    │  │  - Kanban    │         │
│  │  - Dashboard │  │  - Dashboard │  │  - Dashboard │         │
│  │  - Graph     │  │  - Settings  │  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           │                                    │
└───────────────────────────┼────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Shared Core Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  packages/core/                                                 │
│  ├─ client/              # Daemon communication                │
│  │  ├─ DaemonClient.ts   # JSON-RPC client                     │
│  │  ├─ WsClient.ts       # WebSocket client                    │
│  │  └─ discovery.ts      # Daemon discovery                    │
│  │                                                              │
│  ├─ types/               # Shared type definitions             │
│  │  ├─ agent.ts          # Agent types                         │
│  │  ├─ task.ts           # Task types                          │
│  │  ├─ pipeline.ts       # Pipeline types                      │
│  │  └─ index.ts          # Re-exports                          │
│  │                                                              │
│  ├─ hooks/ (planned)     # Shared data hooks                   │
│  │  ├─ useAgents.ts      # Agent data management               │
│  │  ├─ useTasks.ts       # Task data management                │
│  │  └─ usePipelines.ts   # Pipeline data management            │
│  │                                                              │
│  ├─ utils/               # Shared utilities                    │
│  │  ├─ tmuxService.ts    # Tmux operations                     │
│  │  ├─ processTracker.ts # Process categorization              │
│  │  └─ promptBuilder.ts  # Prompt construction                 │
│  │                                                              │
│  └─ logic/               # Business logic                      │
│     ├─ pipelineEngine.ts # Pipeline execution                  │
│     ├─ taskRouter.ts     # Task routing                        │
│     └─ swimlaneGrouping.ts # Task grouping                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Daemon Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  packages/daemon/                                               │
│  ├─ server.ts            # HTTP/WS server                      │
│  ├─ rpcRouter.ts         # JSON-RPC routing                    │
│  ├─ apiHandler.ts        # API endpoint handlers               │
│  ├─ supervisor.ts        # Process supervision                 │
│  └─ database.ts          # SQLite persistence                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

### 1. Core Package (`packages/core/`)

**Purpose:** Shared business logic, types, and utilities used by all UIs.

**Contents:**
```
packages/core/
├── client/
│   ├── daemonClient.ts      # Main daemon client
│   ├── wsClient.ts          # WebSocket client
│   ├── discovery.ts         # Daemon discovery
│   └── types.ts             # Client types
│
├── types/
│   ├── agent.ts             # AgentInfo, AgentStatus
│   ├── task.ts              # TaskInfo, TaskStatus
│   ├── pipeline.ts          # PipelineInfo, PipelineStage
│   ├── kanban.ts            # KanbanColumn, KanbanCard
│   └── index.ts             # Re-exports all types
│
├── hooks/ (React-agnostic)
│   ├── useAgents.ts         # Agent data fetching
│   ├── useTasks.ts          # Task data fetching
│   ├── usePipelines.ts      # Pipeline data fetching
│   └── useDaemon.ts         # Daemon connection
│
├── utils/
│   ├── tmuxService.ts       # Tmux CLI wrapper
│   ├── processTracker.ts   # Process categorization
│   ├── promptBuilder.ts     # Prompt construction
│   └── helpers.ts           # General utilities
│
└── logic/
    ├── pipelineEngine.ts    # Pipeline DAG execution
    ├── taskRouter.ts        # Priority-based routing
    ├── swimlaneGrouping.ts  # Task grouping strategies
    └── orchestrator.ts      # Agent orchestration
```

**Dependencies:** None (or minimal - only Node.js built-ins)

---

### 2. TUI Package (`packages/tui/`)

**Purpose:** Terminal UI using Ink (React for CLIs)

**Contents:**
```
packages/tui/
├── src/
│   ├── components/
│   │   ├── AgentList.tsx        # Agent list view
│   │   ├── TaskBoard.tsx        # Task list view
│   │   ├── KanbanBoard.tsx      # Kanban board view
│   │   ├── PipelineView.tsx     # Pipeline view
│   │   ├── StatusBar.tsx        # Status bar
│   │   └── App.tsx              # Main app
│   │
│   ├── hooks/
│   │   ├── useAgents.ts         # Uses core/client
│   │   ├── useTasks.ts          # Uses core/client
│   │   └── useDaemon.ts         # Uses core/client
│   │
│   └── types.ts                 # TUI-specific types
│
└── tui.cjs                      # Launcher script
```

**Dependencies:**
- `@tmux-agents/core` (shared logic)
- `ink` (terminal rendering)
- `react` (for Ink)

---

### 3. Web UI Package (`packages/cli/src/web/`)

**Purpose:** Web dashboard served by HTTP server

**Contents:**
```
packages/cli/src/web/
├── server.ts                # HTTP server
├── dashboard.html           # Inline dashboard HTML (in server.ts)
└── kanban.html              # Kanban board HTML
```

**Technology:** Vanilla HTML/CSS/JavaScript (no framework)

**Dependencies:**
- `@tmux-agents/core` (via daemon client calls)
- Node.js `http` module

---

### 4. CLI Package (`packages/cli/`)

**Purpose:** Command-line interface for daemon management

**Contents:**
```
packages/cli/
├── src/
│   ├── cli/
│   │   ├── index.ts             # Main CLI entry
│   │   └── commands/
│   │       ├── daemon.ts        # daemon start/stop/status
│   │       ├── agent.ts         # agent spawn/list/kill
│   │       └── task.ts          # task create/list/update
│   │
│   ├── client/
│   │   └── daemonClient.ts      # Re-export from core
│   │
│   └── web/
│       └── server.ts            # Web UI server
│
└── dist/                        # Compiled output
```

**Dependencies:**
- `@tmux-agents/core` (shared logic)
- `commander` (CLI framework)

---

### 5. VS Code Extension (`src/`)

**Purpose:** VS Code extension with webviews

**Contents:**
```
src/
├── extension.ts                 # Extension entry point
├── kanbanView.ts                # Kanban webview
├── dashboardView.ts             # Dashboard webview
├── graphView.ts                 # Pipeline graph webview
├── treeProvider.ts              # Sidebar tree view
├── aiAssistant.ts               # AI provider management
├── commands/
│   ├── agentCommands.ts         # Agent commands
│   └── sessionCommands.ts       # Session commands
└── (uses types/logic from core via imports)
```

**Dependencies:**
- `@tmux-agents/core` (will be refactored to use)
- `vscode` (VS Code API)

---

## Adding New Features: Step-by-Step Guide

### Example: Adding "Task Comments" Feature

#### Step 1: Update Core Types

**File:** `packages/core/types/task.ts`

```typescript
export interface TaskInfo {
  id: string;
  title: string;
  status: TaskStatus;
  // ... existing fields ...

  // ✅ Add new field
  comments?: TaskComment[];
}

// ✅ Add new type
export interface TaskComment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}
```

#### Step 2: Update Core Client

**File:** `packages/core/client/daemonClient.ts`

```typescript
export class DaemonClient {
  // ... existing methods ...

  // ✅ Add new method
  async addTaskComment(taskId: string, comment: string): Promise<TaskComment> {
    return this.call('task.addComment', { taskId, comment });
  }

  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    return this.call('task.getComments', { taskId });
  }
}
```

#### Step 3: Update Daemon API

**File:** `packages/daemon/apiHandler.ts`

```typescript
export class ApiHandler {
  // ✅ Add RPC handlers
  async handleTaskAddComment(params: any): Promise<TaskComment> {
    const { taskId, comment } = params;
    // Implementation...
    return newComment;
  }

  async handleTaskGetComments(params: any): Promise<TaskComment[]> {
    const { taskId } = params;
    // Implementation...
    return comments;
  }
}
```

#### Step 4a: Add UI to TUI

**File:** `packages/tui/src/components/TaskDetail.tsx`

```tsx
import { DaemonClient } from '@tmux-agents/core';

export function TaskDetail({ task, client }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);

  useEffect(() => {
    client.getTaskComments(task.id).then(setComments);
  }, [task.id]);

  return (
    <Box flexDirection="column">
      <Text bold>{task.title}</Text>

      {/* ✅ New comments section */}
      <Box marginTop={1}>
        <Text underline>Comments:</Text>
        {comments.map(c => (
          <Text key={c.id}>{c.author}: {c.text}</Text>
        ))}
      </Box>
    </Box>
  );
}
```

#### Step 4b: Add UI to Web

**File:** `packages/cli/src/web/dashboard.html` (or separate page)

```javascript
async function loadTaskComments(taskId) {
  const comments = await callDaemon('task.getComments', { taskId });

  const commentsHtml = comments.map(c => `
    <div class="comment">
      <strong>${c.author}</strong>: ${c.text}
    </div>
  `).join('');

  document.getElementById('comments').innerHTML = commentsHtml;
}
```

#### Step 4c: Add UI to VS Code Extension

**File:** `src/kanbanView.ts`

```typescript
import { DaemonClient, TaskComment } from '@tmux-agents/core';

export class KanbanViewProvider {
  private async showTaskComments(taskId: string) {
    const comments = await this.client.getTaskComments(taskId);

    // Update webview HTML with comments
    this.panel.webview.html = this.getHtmlWithComments(comments);
  }
}
```

---

## Sharing Guidelines

### ✅ SHOULD Be in Core Package

1. **Types & Interfaces**
   - All data models (Agent, Task, Pipeline, etc.)
   - RPC request/response types
   - Status enums and constants

2. **Business Logic**
   - Pipeline execution engine
   - Task routing algorithms
   - Agent orchestration logic
   - Process categorization

3. **Daemon Communication**
   - DaemonClient (JSON-RPC)
   - WebSocket client
   - Daemon discovery
   - Connection management

4. **Utilities**
   - Tmux service wrapper
   - Prompt builders
   - Data transformations
   - Validation helpers

### ❌ SHOULD NOT Be in Core Package

1. **UI Components**
   - Ink components (TUI-specific)
   - HTML templates (Web-specific)
   - VSCode webviews (Extension-specific)

2. **Framework-Specific Code**
   - React hooks (unless framework-agnostic)
   - VSCode API calls
   - Ink-specific rendering

3. **UI State Management**
   - Local UI state
   - View-specific selections
   - UI preferences

4. **Presentation Logic**
   - Color schemes
   - Layout calculations
   - Formatting (dates, numbers)

---

## Migration Path

### Current State

```
src/                    # VS Code extension (monolithic)
├── types.ts            # ⚠️ Should move to core
├── tmuxService.ts      # ⚠️ Should move to core
├── pipelineEngine.ts   # ⚠️ Should move to core
├── kanbanView.ts       # ✅ Stay (UI-specific)
└── extension.ts        # ✅ Stay (UI-specific)

packages/
├── core/               # ✅ Being built
├── cli/                # ✅ Uses core
├── tui/                # ⚠️ Some duplication with src/
└── daemon/             # ✅ Independent
```

### Target State

```
packages/
├── core/               # ✅ All shared logic
│   ├── types/
│   ├── client/
│   ├── logic/
│   └── utils/
│
├── extension/          # VS Code extension (moved from src/)
│   ├── views/
│   └── commands/
│
├── tui/                # Terminal UI
│   └── components/
│
├── cli/                # CLI + Web
│   ├── commands/
│   └── web/
│
└── daemon/             # Daemon
    └── api/
```

### Migration Steps

**Phase 1: Extract Core** ✅ (In Progress)
- [x] Create `packages/core/`
- [x] Move types to `core/types/`
- [x] Move DaemonClient to `core/client/`
- [ ] Move tmuxService to `core/utils/`
- [ ] Move pipelineEngine to `core/logic/`
- [ ] Move taskRouter to `core/logic/`

**Phase 2: Update Consumers**
- [ ] Update TUI to import from `@tmux-agents/core`
- [ ] Update CLI to import from `@tmux-agents/core`
- [ ] Update Extension to import from `@tmux-agents/core`

**Phase 3: Eliminate Duplication**
- [ ] Remove duplicated types from each package
- [ ] Remove duplicated logic
- [ ] Ensure single source of truth

**Phase 4: Documentation**
- [x] Create ARCHITECTURE.md
- [ ] Add inline documentation
- [ ] Create contribution guide

---

## Best Practices

### 1. **Single Source of Truth**
   - Types defined once in `core/types/`
   - Business logic in `core/logic/`
   - UI packages only contain presentation code

### 2. **Dependency Flow**
   ```
   UI Packages → Core Package → Daemon
   (one-way flow)
   ```

### 3. **Versioning**
   - All packages share the same version
   - Breaking changes in core require updates to all UIs
   - Use semantic versioning

### 4. **Testing**
   - Core package: Unit tests for all logic
   - UI packages: Integration tests with mocked daemon
   - E2E tests: Full stack testing

### 5. **Type Safety**
   - All packages use TypeScript strict mode
   - No `any` types
   - Comprehensive interfaces

---

## Development Workflow

### Adding a New Feature

1. **Design Phase**
   - Identify what belongs in core vs. UI
   - Update types in `core/types/`
   - Design RPC methods

2. **Core Implementation**
   - Add types
   - Add client methods
   - Write tests

3. **Daemon Implementation**
   - Add RPC handlers
   - Update database schema if needed
   - Test with curl/Postman

4. **UI Implementation** (Parallel)
   - TUI: Add Ink components
   - Web: Update HTML/JS
   - VSCode: Add webview features

5. **Testing & Documentation**
   - Unit tests (core)
   - Integration tests (each UI)
   - Update ARCHITECTURE.md if needed

---

## Future Enhancements

### Planned Improvements

1. **Shared Hooks Library**
   - Framework-agnostic data hooks
   - Can be used by TUI (React/Ink) and future React-based Web UI

2. **Shared Styling System**
   - Color palette definitions
   - Shared design tokens
   - Cross-platform consistent UX

3. **Plugin System**
   - Core plugins that work across all UIs
   - UI-specific plugin APIs

4. **Real-time Sync**
   - WebSocket-based state synchronization
   - Optimistic updates
   - Conflict resolution

---

## Examples

### Example 1: Task Priority Update

**Core (Shared):**
```typescript
// packages/core/client/daemonClient.ts
async updateTaskPriority(taskId: string, priority: 'low' | 'medium' | 'high'): Promise<void> {
  await this.call('task.updatePriority', { taskId, priority });
}
```

**TUI:**
```tsx
// packages/tui/src/components/TaskBoard.tsx
const handlePriorityChange = async (taskId: string, priority: string) => {
  await client.updateTaskPriority(taskId, priority);
  refresh();
};
```

**Web:**
```javascript
// packages/cli/src/web/dashboard.html
async function updatePriority(taskId, priority) {
  await callDaemon('task.updatePriority', { taskId, priority });
  refresh();
}
```

**Result:** Same backend logic, different UI implementations!

---

### Example 2: Real-Time Agent Updates

**Core (Shared):**
```typescript
// packages/core/client/daemonClient.ts
subscribe(handler: (event: string, data: any) => void): () => void {
  if (!this.wsClient) return () => {};
  return this.wsClient.subscribe(handler);
}
```

**TUI:**
```tsx
// packages/tui/src/hooks/useAgents.ts
useEffect(() => {
  const unsubscribe = client.subscribe((event, data) => {
    if (event === 'agent.updated') {
      refreshAgents();
    }
  });
  return unsubscribe;
}, [client]);
```

**Web:**
```javascript
// packages/cli/src/web/dashboard.html
const ws = new WebSocket('ws://localhost:3457');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'agent.updated') {
    refresh();
  }
};
```

**Result:** Real-time updates work everywhere!

---

## Conclusion

This shared component architecture ensures:

✅ **No Code Duplication** - Write business logic once
✅ **Consistent Behavior** - All UIs work the same way
✅ **Easy Maintenance** - Fix bugs in one place
✅ **Rapid Development** - New features available everywhere
✅ **Type Safety** - Shared types prevent errors
✅ **Flexibility** - Each UI can customize presentation

**New features added to the daemon are automatically available to all UIs with minimal effort!**

---

## Questions?

- **Q: Can I use React hooks from core in the Web UI?**
  A: Not directly if Web UI uses vanilla JS. Consider making hooks framework-agnostic or creating a React-based Web UI.

- **Q: Should validation logic be in core or daemon?**
  A: Both! Client-side validation in core for UX, server-side validation in daemon for security.

- **Q: How do I handle UI-specific state?**
  A: Keep it local to the UI package. Only shared data goes in core.

- **Q: Can I add UI-specific methods to DaemonClient?**
  A: No. Keep DaemonClient pure. Create UI-specific wrappers if needed.

---

**Last Updated:** 2026-02-14
**Maintained By:** tmux-agents core team
**Next Review:** When adding major features

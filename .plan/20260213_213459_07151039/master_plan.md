---
session_id: 20260213_213459_07151039
created_at: 2026-02-13 21:34:59
status: executing
max_iterations: 10
base_plan: /Users/chelsea/dev/tmux-agents-refactor/plan/plan.md
---

# Master Plan: tmux-agents Refactoring Completion

## Project Overview

Complete the refactoring of tmux-agents from a VS Code extension into a daemon-based, runtime-agnostic AI agent orchestration platform. This refactoring enables multiple client interfaces (VS Code, CLI, TUI, MCP) to connect to a central daemon that manages agents across multiple execution backends (tmux, Docker, Kubernetes).

## Current State Analysis

### Completed Components ✅
- **Phase 2b: Client Library** - DaemonClient implemented and working
- **Phase 4a: Docker Runtime** - DockerRuntime fully implemented
- **Phase 4b: K8s Runtime** - K8sRuntime implemented, API updated to v0.22.0

### Critical Blocker 🔴
- **Phase 2a: Daemon** - Completion checklist claims done, but actual implementation DOES NOT EXIST
  - No src/daemon/ directory
  - No supervisor.ts, server.ts, or any daemon server files
  - This blocks all clients from functioning

### Incomplete Components ⚠️
- **Phase 1: Core Extraction** - Partially done but not verified
- **Phase 3a: CLI** - Commands exist but daemon start doesn't work (no supervisor to spawn)
- **Phase 3b: MCP Server** - Exists but untested without daemon
- **Phase 3c: TUI** - Exists but can't connect (no daemon running)
- **Phase 5: Integration** - Cannot proceed without daemon

## Ultrathink Analysis

### Component Decomposition Reasoning

The existing plan at `/Users/chelsea/dev/tmux-agents-refactor/plan/plan.md` already has an excellent decomposition. However, the **actual implementation state does not match the completion checklist**. The daemon was never built despite being marked complete.

### Why This Decomposition Works

1. **Foundation First**: Core extraction removes VS Code dependencies, enabling standalone daemon
2. **Infrastructure Next**: Daemon + client library provide the API layer all clients need
3. **Parallel Clients**: CLI, MCP, TUI can develop concurrently once daemon exists
4. **Runtime Expansion**: Docker/K8s runtimes are independent extensions (already done)
5. **Integration Last**: Wire everything together and validate E2E

### Critical Path

```
Core Extraction (partial)
    ↓
Daemon Implementation (MISSING - CRITICAL BLOCKER)
    ↓
├─→ CLI Completion
├─→ MCP Server Completion
└─→ TUI Completion
    ↓
Integration & QA
```

## Definition of Done

From `/Users/chelsea/dev/tmux-agents-refactor/memory/learnings/completion-checklist.md`:

### Phase 1: Core Extraction
- [ ] All VS Code dependencies removed from src/core/
- [ ] serviceManager → RuntimeManager complete
- [ ] All core files moved and verified
- [ ] All 498+ tests passing
- [ ] Branch ready to merge

### Phase 2a: Daemon (CRITICAL - Must Actually Build)
- [ ] All 9 daemon modules implemented (supervisor, server, rpcRouter, apiHandler, eventBus, reconciler, health, config, log)
- [ ] JSON-RPC 2.0 API complete with 40+ methods
- [ ] Unix socket + HTTP + SSE servers working
- [ ] Supervisor process management (fork, restart, circuit breaker)
- [ ] `tmux-agents daemon start` works
- [ ] `tmux-agents daemon status` returns health
- [ ] Tests passing

### Phase 3a: CLI
- [ ] All command groups functional (daemon, agent, task, team, pipeline, runtime, fanout)
- [ ] Formatters working (table, kanban, icons)
- [ ] Shell completion scripts
- [ ] `./packages/cli/dist/cli/index.js --help` works
- [ ] Integration tests passing

### Phase 3b: MCP Server
- [ ] 12 tools implemented with Zod validation
- [ ] 4 resources implemented
- [ ] 3 prompts implemented
- [ ] MCP server starts on stdio
- [ ] Works with Claude Code/Desktop

### Phase 3c: TUI
- [ ] All components working (AgentList, TaskBoard, PipelineView, StatusBar, SettingsPanel, PreviewHint)
- [ ] All hooks working (useDaemon, useAgents, useTasks, usePipelines, useEvents)
- [ ] WebSocket events integrated
- [ ] Tests passing

### Phase 5: Integration
- [ ] All branches merged to main
- [ ] All tests passing (498+ existing + all new tests)
- [ ] E2E scenario 1: Daemon start/stop works
- [ ] E2E scenario 2: CLI spawns agent via daemon
- [ ] E2E scenario 3: TUI shows live agent updates
- [ ] E2E scenario 4: MCP tools work
- [ ] E2E scenario 7: Agent auto-reconnect after daemon restart
- [ ] Documentation updated

## Dependency Graph

```
Phase 1: Core Extraction (partial - verify & complete)
    ↓
Phase 2a: Daemon Implementation (MUST BUILD FROM SCRATCH)
    ├──→ implements supervisor.ts (process management)
    ├──→ implements server.ts (main daemon class)
    ├──→ implements rpcRouter.ts (40+ RPC methods)
    ├──→ implements apiHandler.ts (Unix socket + HTTP + WebSocket)
    ├──→ implements eventBus.ts (event forwarding)
    ├──→ implements reconciler.ts (crash recovery)
    ├──→ implements health.ts (health checks)
    ├──→ implements config.ts (TOML config)
    └──→ implements log.ts (structured logging)
    ↓
Phase 3: Client Implementations (PARALLEL)
    ├──→ CLI: Fix daemon start, rebuild, test
    ├──→ MCP: Test with running daemon
    └──→ TUI: Test connection, verify all features
    ↓
Phase 5: Integration & QA
    └──→ E2E tests, merge branches, final verification
    ↓
<promise>Done</promise>
```

## Execution Strategy

### Wave 1: Foundation (Sequential)
1. **Phase 1 Verification Agent** - Verify core extraction is complete, fix any issues
   - Estimated: 2 iterations
   - Output: Core extraction verified or completed

### Wave 2: Critical Blocker (Sequential - Depends on Wave 1)
2. **Phase 2a Daemon Implementation Agent** - BUILD THE COMPLETE DAEMON
   - Estimated: 5-8 iterations (2000+ LOC)
   - Output: Fully functional daemon server
   - **This is the most critical and complex component**

### Wave 3: Client Completion (Parallel - Depends on Wave 2)
3. **Phase 3a CLI Agent** - Fix daemon start command, rebuild, test
   - Estimated: 2 iterations
   - Can start after daemon exists

4. **Phase 3b MCP Agent** - Test and fix any issues with running daemon
   - Estimated: 2 iterations
   - Can run parallel with CLI

5. **Phase 3c TUI Agent** - Test connection, verify features work
   - Estimated: 2 iterations
   - Can run parallel with CLI and MCP

### Wave 4: Final Integration (Sequential - Depends on Wave 3)
6. **Phase 5 Integration & QA Agent** - E2E tests, merge, validate
   - Estimated: 3 iterations
   - Output: Complete refactoring verified

## Subplans

| Component | Existing Plan Path | Dependencies | Wave |
|-----------|-------------------|--------------|------|
| Core Extraction | /Users/chelsea/dev/tmux-agents-refactor/plan/core-extraction/plan.md | None | 1 |
| Daemon | /Users/chelsea/dev/tmux-agents-refactor/plan/daemon/plan.md | Core | 2 |
| CLI | /Users/chelsea/dev/tmux-agents-refactor/plan/cli/plan.md | Daemon | 3 |
| MCP Server | /Users/chelsea/dev/tmux-agents-refactor/plan/mcp-server/plan.md | Daemon | 3 |
| TUI | /Users/chelsea/dev/tmux-agents-refactor/plan/tui/plan.md | Daemon | 3 |
| Integration | /Users/chelsea/dev/tmux-agents-refactor/plan/integration/plan.md | All above | 4 |

## Agent Orchestration Commands

### Wave 1: Foundation

#### Phase 1: Core Extraction Verification
```
Task: subagent_type="general-purpose", description="Verify Phase 1 core extraction"

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "Verify Phase 1 core extraction is complete per /Users/chelsea/dev/tmux-agents-refactor/plan/core-extraction/plan.md. Check all DoD items. Fix any incomplete items. Run verification script. When ALL criteria met, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"

CRITICAL: You MUST invoke the Skill tool - writing /ralph-loop as text does NOT activate the loop.
```

### Wave 2: Critical Blocker (After Wave 1 completes)

#### Phase 2a: Daemon Implementation
```
Task: subagent_type="general-purpose", description="Implement complete daemon server"

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "BUILD the complete daemon implementation per /Users/chelsea/dev/tmux-agents-refactor/plan/daemon/plan.md. Create all 9 files in src/daemon/. Implement all 40+ RPC methods. Write tests. Verify ALL DoD items. The daemon MUST actually work and start. When ALL criteria met and daemon runs successfully, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"

CRITICAL: This is the most important component. The daemon must be FULLY IMPLEMENTED, not just planned.
```

### Wave 3: Clients (After Wave 2 completes - Launch in PARALLEL)

#### Phase 3a: CLI Completion
```
Task: subagent_type="general-purpose", description="Complete CLI implementation", run_in_background=true

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "Complete CLI per /Users/chelsea/dev/tmux-agents-refactor/plan/cli/plan.md. Fix daemon start command (already partially implemented). Rebuild packages/cli. Test all commands with running daemon. Verify ALL DoD items. When complete, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"
```

#### Phase 3b: MCP Server Completion
```
Task: subagent_type="general-purpose", description="Complete MCP server", run_in_background=true

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "Complete MCP server per /Users/chelsea/dev/tmux-agents-refactor/plan/mcp-server/plan.md. Test all 12 tools with running daemon. Verify all resources and prompts work. Check ALL DoD items. When complete, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"
```

#### Phase 3c: TUI Completion
```
Task: subagent_type="general-purpose", description="Complete TUI implementation", run_in_background=true

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "Complete TUI per /Users/chelsea/dev/tmux-agents-refactor/plan/tui/plan.md. Test DaemonClient connection. Verify all components render. Test all keyboard shortcuts. Check ALL DoD items. When complete, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"
```

### Wave 4: Integration (After Wave 3 completes)

#### Phase 5: Integration & QA
```
Task: subagent_type="general-purpose", description="Final integration and QA"

Your FIRST action MUST be to use the Skill tool:
  - skill: "ralph-loop:ralph-loop"
  - args: "Execute integration and QA per /Users/chelsea/dev/tmux-agents-refactor/plan/integration/plan.md. Run all E2E scenarios. Verify all 754+ tests pass. Merge all branches. Validate complete refactoring. When ALL success criteria met, output: <promise>Done</promise> --completion-promise Done --max-iterations 10"
```

## Completion Criteria

The master plan is complete when:

1. ✅ ALL Wave 1 agents output `<promise>Done</promise>`
2. ✅ ALL Wave 2 agents output `<promise>Done</promise>`
3. ✅ ALL Wave 3 agents output `<promise>Done</promise>`
4. ✅ ALL Wave 4 agents output `<promise>Done</promise>`
5. ✅ All DoD criteria from the completion checklist are TRUE
6. ✅ The daemon actually runs: `tmux-agents daemon start` works
7. ✅ The CLI works: `tmux-agents agent spawn -r coder "task"` works
8. ✅ The TUI connects: `tmux-agents tui` shows dashboard
9. ✅ All 754+ tests passing
10. ✅ All E2E scenarios validated

Then and ONLY then, output:

<promise>Done</promise>

## Execution Notes

- **Critical**: The daemon implementation (Wave 2) is the blocker for everything else
- **Strategy**: Build daemon completely before attempting client work
- **Testing**: Each wave must verify its DoD before proceeding
- **Failure handling**: If any agent fails to complete, fix issues before continuing to next wave
- **Final check**: Before outputting completion promise, verify EVERY DoD item is TRUE

## Session Tracking

Session directory: `.plan/20260213_213459_07151039/`
Base plan: `/Users/chelsea/dev/tmux-agents-refactor/plan/plan.md`
Completion checklist: `/Users/chelsea/dev/tmux-agents-refactor/memory/learnings/completion-checklist.md`

Progress will be tracked in this directory with agent output logs.

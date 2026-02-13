"use strict";
// ─── Core Public API ───────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * src/core/index.ts - Barrel export for all core modules
 * This is the public API that clients (daemon, CLI, TUI, MCP) import from
 */
// Infrastructure
__exportStar(require("./eventBus"), exports);
__exportStar(require("./config"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./disposable"), exports);
__exportStar(require("./eventEmitter"), exports);
// Business Logic
__exportStar(require("./processTracker"), exports);
__exportStar(require("./activityRollup"), exports);
__exportStar(require("./pipelineEngine"), exports);
__exportStar(require("./taskRouter"), exports);
__exportStar(require("./swimlaneGrouping"), exports);
__exportStar(require("./aiModels"), exports);
__exportStar(require("./promptBuilder"), exports);
__exportStar(require("./promptRegistry"), exports);
__exportStar(require("./promptExecutor"), exports);
__exportStar(require("./tmuxService"), exports);
__exportStar(require("./orchestrator"), exports);
__exportStar(require("./database"), exports);
__exportStar(require("./memoryManager"), exports);
// Note: Additional exports will be added as we move more files to core/
// - TmuxService
// - ServiceManager (renamed RuntimeManager)
// - AgentOrchestrator
// - PipelineEngine
// - TaskRouter
// - TeamManager
// - Database
// - ProcessTracker
// - ActivityRollup
// - ApiCatalog (core actions only)
// - AIAssistantManager
// - AIModels
// - PromptBuilder
// - PromptRegistry
// - PromptExecutor
// - AutoMonitor
// - AutoCloseMonitor
// - SessionSync
// - MemoryManager
// - SwimlaneGrouping
// - SmartAttachment
// - AgentTemplate
// - OrganizationManager
// - GuildManager
//# sourceMappingURL=index.js.map
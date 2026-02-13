// ─── Core Public API ───────────────────────────────────────────────────────

/**
 * src/core/index.ts - Barrel export for all core modules
 * This is the public API that clients (daemon, CLI, TUI, MCP) import from
 */

// Infrastructure
export * from './eventBus';
export * from './config';
export * from './types';
export * from './disposable';
export * from './eventEmitter';

// Business Logic
export * from './processTracker';
export * from './activityRollup';
export * from './pipelineEngine';
export * from './taskRouter';
export * from './swimlaneGrouping';
export * from './aiModels';
export * from './promptBuilder';
export * from './promptRegistry';
export * from './promptExecutor';
export * from './tmuxService';
export * from './database';
export * from './orchestrator';
export * from './memoryManager';

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

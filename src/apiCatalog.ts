import * as vscode from 'vscode';
import { ApiCatalog as CoreApiCatalog, ApiCatalogDeps as CoreApiCatalogDeps, ok } from './core/apiCatalog';
import { TmuxServiceManager } from './serviceManager';
import { AgentOrchestrator } from './orchestrator';
import { TeamManager } from './teamManager';
import { PipelineEngine } from './pipelineEngine';
import { AgentTemplateManager } from './agentTemplate';
import { TaskRouter } from './taskRouter';
import { AIAssistantManager } from './aiAssistant';
import { OrchestratorTask, KanbanSwimLane } from './types';

// Export all types from core
export * from './core/apiCatalog';

export interface ApiCatalogDeps {
    serviceManager: TmuxServiceManager;
    orchestrator: AgentOrchestrator;
    teamManager: TeamManager;
    pipelineEngine: PipelineEngine;
    templateManager: AgentTemplateManager;
    taskRouter: TaskRouter;
    aiManager: AIAssistantManager;
    refreshTree: () => void;
    getSwimLanes?: () => KanbanSwimLane[];
    addSwimLane?: (lane: KanbanSwimLane) => void;
    deleteSwimLane?: (id: string) => void;
    saveSwimLane?: (lane: KanbanSwimLane) => void;
    updateKanban?: () => void;
    getKanbanTasks?: () => OrchestratorTask[];
    saveTask?: (task: OrchestratorTask) => void;
    deleteTask?: (taskId: string) => void;
    startTaskFlow?: (task: OrchestratorTask, options?: { additionalInstructions?: string; askForContext?: boolean }) => Promise<void>;
}

/**
 * VS Code adapter for ApiCatalog
 * Extends core catalog and adds VS Code-specific actions
 */
export class ApiCatalog extends CoreApiCatalog {
    constructor(deps: ApiCatalogDeps) {
        // Cast deps to core interface (types are compatible but TS doesn't see it)
        super(deps as unknown as CoreApiCatalogDeps);

        // Register VS Code-specific actions
        this.registerVSCodeActions();
        this.registerQuickActions();
    }

    private registerVSCodeActions(): void {
        const cat = 'VS Code Integration';

        this.register({
            name: 'vscode.openDashboard', category: cat,
            description: 'Open the Agent Dashboard panel in VS Code',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openDashboard');
                return ok('Opened Agent Dashboard');
            }
        });

        this.register({
            name: 'vscode.openPipelineGraph', category: cat,
            description: 'Open the Pipeline Graph view in VS Code',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openGraph');
                return ok('Opened Pipeline Graph');
            }
        });

        this.register({
            name: 'vscode.refreshTree', category: cat,
            description: 'Refresh the tmux tree view',
            params: [],
            returnsData: false,
            execute: async () => {
                this.deps.refreshTree();
                return ok('Refreshed tree view');
            }
        });

        this.register({
            name: 'vscode.openKanban', category: cat,
            description: 'Open the Kanban board panel',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok('Opened Kanban board');
            }
        });

        this.register({
            name: 'vscode.spawnAgent', category: cat,
            description: 'Open the interactive Spawn Agent dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.spawnAgent');
                return ok('Opened Spawn Agent dialog');
            }
        });

        this.register({
            name: 'vscode.submitTask', category: cat,
            description: 'Open the interactive Submit Task dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.submitTask');
                return ok('Opened Submit Task dialog');
            }
        });

        this.register({
            name: 'vscode.manageTemplates', category: cat,
            description: 'Open the Manage Templates dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.manageTemplates');
                return ok('Opened Manage Templates dialog');
            }
        });

        this.register({
            name: 'vscode.fanOut', category: cat,
            description: 'Open the Fan-Out Task dialog',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.fanOut');
                return ok('Opened Fan-Out dialog');
            }
        });

        // Override kanban.open to actually open the VS Code panel
        this.register({
            name: 'kanban.open', category: 'Kanban Board',
            description: 'Open the Kanban task board',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.openKanban');
                return ok('Opened Kanban board');
            }
        });
    }

    private registerQuickActions(): void {
        const cat = 'Quick Actions';

        this.register({
            name: 'team.quickCoding', category: cat,
            description: 'Spawn a pre-configured coding team (coder + reviewer + tester)',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.quickTeamCoding');
                return ok('Started coding team');
            }
        });

        this.register({
            name: 'team.quickResearch', category: cat,
            description: 'Spawn a pre-configured research team (2 researchers + 1 coder)',
            params: [],
            returnsData: false,
            execute: async () => {
                await vscode.commands.executeCommand('tmux-agents.quickTeamResearch');
                return ok('Started research team');
            }
        });
    }
}

import * as vscode from 'vscode';
import { AgentOrchestrator as CoreOrchestrator } from './core/orchestrator';
import { TmuxServiceManager } from './serviceManager';
import { AIAssistantManager } from './aiAssistant';
import {
    AgentInstance,
    AgentRole,
    AgentState,
    OrchestratorTask,
    TaskStatus,
    AgentMessage,
} from './types';

/**
 * VS Code adapter for AgentOrchestrator
 * Wraps the core orchestrator and provides VS Code-compatible event emitters
 */
export class AgentOrchestrator implements vscode.Disposable {
    private core: CoreOrchestrator;

    // VS Code event emitters that mirror core events
    private readonly _onAgentStateChanged = new vscode.EventEmitter<AgentInstance>();
    public readonly onAgentStateChanged: vscode.Event<AgentInstance> = this._onAgentStateChanged.event;

    private readonly _onTaskCompleted = new vscode.EventEmitter<OrchestratorTask>();
    public readonly onTaskCompleted: vscode.Event<OrchestratorTask> = this._onTaskCompleted.event;

    private readonly _onPipelineEvent = new vscode.EventEmitter<{ pipelineId: string; event: string }>();
    public readonly onPipelineEvent: vscode.Event<{ pipelineId: string; event: string }> = this._onPipelineEvent.event;

    private readonly _onAgentMessage = new vscode.EventEmitter<AgentMessage>();
    public readonly onAgentMessage: vscode.Event<AgentMessage> = this._onAgentMessage.event;

    constructor(aiAssistantManager?: AIAssistantManager) {
        // Create core orchestrator with AI assistant manager
        this.core = new CoreOrchestrator(aiAssistantManager || new AIAssistantManager());

        // Wire up core events to VS Code event emitters
        this.core.onAgentStateChanged((agent) => this._onAgentStateChanged.fire(agent));
        this.core.onTaskCompleted((task) => this._onTaskCompleted.fire(task));
        this.core.onPipelineEvent((event) => this._onPipelineEvent.fire(event));
        this.core.onAgentMessage((message) => this._onAgentMessage.fire(message));
    }

    // ─── Delegate all methods to core ──────────────────────────────────

    public setServiceManager(sm: TmuxServiceManager): void {
        // FIXME: TmuxServiceManager returns VS Code TmuxService, but core expects core TmuxService
        // These are compatible in practice but TypeScript sees them as different types
        this.core.setServiceManager(sm as any);
    }

    public registerAgent(agent: AgentInstance): void {
        this.core.registerAgent(agent);
    }

    public removeAgent(agentId: string): void {
        this.core.removeAgent(agentId);
    }

    public getAgent(agentId: string): AgentInstance | undefined {
        return this.core.getAgent(agentId);
    }

    public getAllAgents(): AgentInstance[] {
        return this.core.getAllAgents();
    }

    public getAgentsByRole(role: AgentRole): AgentInstance[] {
        return this.core.getAgentsByRole(role);
    }

    public getAgentsByTeam(teamId: string): AgentInstance[] {
        return this.core.getAgentsByTeam(teamId);
    }

    public getIdleAgents(role?: AgentRole): AgentInstance[] {
        return this.core.getIdleAgents(role);
    }

    public submitTask(task: OrchestratorTask): void {
        this.core.submitTask(task);
    }

    public cancelTask(taskId: string): void {
        this.core.cancelTask(taskId);
    }

    public getTaskQueue(): OrchestratorTask[] {
        return this.core.getTaskQueue();
    }

    public getTask(taskId: string): OrchestratorTask | undefined {
        return this.core.getTask(taskId);
    }

    public async dispatchNextTask(): Promise<void> {
        return this.core.dispatchNextTask();
    }

    public async sendPromptToAgent(agentId: string, prompt: string): Promise<void> {
        return this.core.sendPromptToAgent(agentId, prompt);
    }

    public async captureAgentOutput(agentId: string, lines: number = 50): Promise<string> {
        return this.core.captureAgentOutput(agentId, lines);
    }

    public getFanOutResults(stageId: string): OrchestratorTask[] {
        return this.core.getFanOutResults(stageId);
    }

    public sendMessage(fromAgentId: string, toAgentId: string, content: string): AgentMessage {
        return this.core.sendMessage(fromAgentId, toAgentId, content);
    }

    public getUnreadMessages(agentId: string): AgentMessage[] {
        return this.core.getUnreadMessages(agentId);
    }

    public markMessageRead(messageId: string): void {
        this.core.markMessageRead(messageId);
    }

    public getAllMessages(): AgentMessage[] {
        return this.core.getAllMessages();
    }

    public getConversation(agentId1: string, agentId2: string): AgentMessage[] {
        return this.core.getConversation(agentId1, agentId2);
    }

    public getIdleAgentsByExpertise(role: AgentRole, expertiseHint?: string): AgentInstance[] {
        return this.core.getIdleAgentsByExpertise(role, expertiseHint);
    }

    public async checkAgentStates(serviceManager: TmuxServiceManager): Promise<void> {
        return this.core.checkAgentStates(serviceManager as any);
    }

    public updateAgentState(agentId: string, newState: AgentState, error?: string): void {
        this.core.updateAgentState(agentId, newState, error);
    }

    public startPolling(serviceManager: TmuxServiceManager, intervalMs: number): void {
        this.core.startPolling(serviceManager as any, intervalMs);
    }

    public stopPolling(): void {
        this.core.stopPolling();
    }

    public dispose(): void {
        this.core.dispose();
        this._onAgentStateChanged.dispose();
        this._onTaskCompleted.dispose();
        this._onPipelineEvent.dispose();
        this._onAgentMessage.dispose();
    }
}

import * as vscode from 'vscode';
import {
    AgentInstance,
    AgentRole,
    AgentState,
    OrchestratorTask,
    TaskStatus,
} from './types';
import { TmuxServiceManager } from './serviceManager';
import { AIAssistantManager } from './aiAssistant';

export class AgentOrchestrator implements vscode.Disposable {
    private agents: Map<string, AgentInstance> = new Map();
    private taskQueue: OrchestratorTask[] = [];

    private serviceManager: TmuxServiceManager | undefined;
    private aiAssistantManager = new AIAssistantManager();
    private pollingInterval: ReturnType<typeof setInterval> | undefined;

    private readonly _onAgentStateChanged = new vscode.EventEmitter<AgentInstance>();
    public readonly onAgentStateChanged: vscode.Event<AgentInstance> = this._onAgentStateChanged.event;

    private readonly _onTaskCompleted = new vscode.EventEmitter<OrchestratorTask>();
    public readonly onTaskCompleted: vscode.Event<OrchestratorTask> = this._onTaskCompleted.event;

    private readonly _onPipelineEvent = new vscode.EventEmitter<{ pipelineId: string; event: string }>();
    public readonly onPipelineEvent: vscode.Event<{ pipelineId: string; event: string }> = this._onPipelineEvent.event;

    // ─── Service Manager ────────────────────────────────────────────────

    public setServiceManager(sm: TmuxServiceManager): void {
        this.serviceManager = sm;
    }

    // ─── Agent Registry ─────────────────────────────────────────────────

    public registerAgent(agent: AgentInstance): void {
        this.agents.set(agent.id, agent);
        this._onAgentStateChanged.fire(agent);
    }

    public removeAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.state = AgentState.TERMINATED;
            this._onAgentStateChanged.fire(agent);
            this.agents.delete(agentId);
        }
    }

    public getAgent(agentId: string): AgentInstance | undefined {
        return this.agents.get(agentId);
    }

    public getAllAgents(): AgentInstance[] {
        return Array.from(this.agents.values());
    }

    public getAgentsByRole(role: AgentRole): AgentInstance[] {
        return this.getAllAgents().filter(a => a.role === role);
    }

    public getAgentsByTeam(teamId: string): AgentInstance[] {
        return this.getAllAgents().filter(a => a.teamId === teamId);
    }

    public getIdleAgents(role?: AgentRole): AgentInstance[] {
        return this.getAllAgents().filter(a => {
            if (a.state !== AgentState.IDLE) {
                return false;
            }
            if (role !== undefined && a.role !== role) {
                return false;
            }
            return true;
        });
    }

    // ─── Task Queue ─────────────────────────────────────────────────────

    public submitTask(task: OrchestratorTask): void {
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);
    }

    public cancelTask(taskId: string): void {
        const task = this.taskQueue.find(t => t.id === taskId);
        if (task) {
            task.status = TaskStatus.CANCELLED;
            this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
        }
    }

    public getTaskQueue(): OrchestratorTask[] {
        return [...this.taskQueue];
    }

    public getTask(taskId: string): OrchestratorTask | undefined {
        return this.taskQueue.find(t => t.id === taskId);
    }

    // ─── Task Dispatch ──────────────────────────────────────────────────

    public async dispatchNextTask(): Promise<void> {
        if (!this.serviceManager) {
            return;
        }

        // Find the highest-priority pending task
        const pendingTask = this.taskQueue.find(t => t.status === TaskStatus.PENDING);
        if (!pendingTask) {
            return;
        }

        // Find an idle agent matching the task's target role
        const idleAgents = this.getIdleAgents(pendingTask.targetRole);
        if (idleAgents.length === 0) {
            return;
        }

        const agent = idleAgents[0];

        // Assign the task
        pendingTask.status = TaskStatus.ASSIGNED;
        pendingTask.assignedAgentId = agent.id;
        pendingTask.startedAt = Date.now();

        agent.currentTaskId = pendingTask.id;
        this.updateAgentState(agent.id, AgentState.WORKING);

        try {
            await this.sendPromptToAgent(agent.id, pendingTask.description);
            pendingTask.status = TaskStatus.IN_PROGRESS;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            pendingTask.status = TaskStatus.FAILED;
            pendingTask.errorMessage = errorMessage;
            this.updateAgentState(agent.id, AgentState.ERROR, errorMessage);
        }
    }

    // ─── Agent Communication ────────────────────────────────────────────

    public async sendPromptToAgent(agentId: string, prompt: string): Promise<void> {
        if (!this.serviceManager) {
            throw new Error('ServiceManager not set');
        }

        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        const service = this.serviceManager.getService(agent.serverId);
        if (!service) {
            throw new Error(`Service not found for server: ${agent.serverId}`);
        }

        await service.sendKeys(agent.sessionName, agent.windowIndex, agent.paneIndex, prompt);
        await service.sendKeys(agent.sessionName, agent.windowIndex, agent.paneIndex, '');
        agent.lastActivityAt = Date.now();
    }

    public async captureAgentOutput(agentId: string, lines: number = 50): Promise<string> {
        if (!this.serviceManager) { return ''; }
        const agent = this.agents.get(agentId);
        if (!agent) { return ''; }
        const service = this.serviceManager.getService(agent.serverId);
        if (!service) { return ''; }
        try {
            return await service.capturePaneContent(agent.sessionName, agent.windowIndex, agent.paneIndex, lines);
        } catch {
            return '';
        }
    }

    public getFanOutResults(stageId: string): OrchestratorTask[] {
        return this.taskQueue.filter(t =>
            t.pipelineStageId === stageId && t.status === TaskStatus.COMPLETED
        );
    }

    // ─── State Monitoring ───────────────────────────────────────────────

    public async checkAgentStates(serviceManager: TmuxServiceManager): Promise<void> {
        const agents = Array.from(this.agents.values());
        for (const agent of agents) {
            if (agent.state === AgentState.TERMINATED || agent.state === AgentState.COMPLETED) {
                continue;
            }

            const service = serviceManager.getService(agent.serverId);
            if (!service) {
                continue;
            }

            try {
                const content = await service.capturePaneContent(
                    agent.sessionName,
                    agent.windowIndex,
                    agent.paneIndex,
                    50
                );

                // Use the AIAssistantManager pattern to detect status from pane content
                const aiStatus = this.aiAssistantManager.detectAIStatus(agent.aiProvider, content);

                let newState: AgentState;
                switch (aiStatus) {
                    case 'working':
                        newState = AgentState.WORKING;
                        break;
                    case 'waiting':
                        newState = AgentState.IDLE;
                        break;
                    case 'idle':
                        newState = AgentState.IDLE;
                        break;
                    default:
                        newState = agent.state;
                        break;
                }

                if (newState !== agent.state) {
                    this.updateAgentState(agent.id, newState);
                }
            } catch {
                // If we can't read the pane, mark as error
                this.updateAgentState(agent.id, AgentState.ERROR, 'Failed to read pane content');
            }
        }
    }

    public updateAgentState(agentId: string, newState: AgentState, error?: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return;
        }

        agent.state = newState;
        agent.lastActivityAt = Date.now();

        if (error) {
            agent.errorMessage = error;
        }

        // If agent transitioned to IDLE and had a current task, mark the task as completed
        if (newState === AgentState.IDLE && agent.currentTaskId) {
            const task = this.taskQueue.find(t => t.id === agent.currentTaskId);
            if (task && task.status === TaskStatus.IN_PROGRESS) {
                task.status = TaskStatus.COMPLETED;
                task.completedAt = Date.now();
                this._onTaskCompleted.fire(task);
            }
            agent.currentTaskId = undefined;
        }

        this._onAgentStateChanged.fire(agent);
    }

    // ─── Polling ────────────────────────────────────────────────────────

    public startPolling(serviceManager: TmuxServiceManager, intervalMs: number): void {
        this.stopPolling();
        this.pollingInterval = setInterval(async () => {
            try {
                await this.checkAgentStates(serviceManager);
                await this.dispatchNextTask();
            } catch (error) {
                console.warn('Agent orchestrator polling error:', error);
            }
        }, intervalMs);
    }

    public stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
        }
    }

    // ─── Dispose ────────────────────────────────────────────────────────

    public dispose(): void {
        this.stopPolling();
        this._onAgentStateChanged.dispose();
        this._onTaskCompleted.dispose();
        this._onPipelineEvent.dispose();
        this.agents.clear();
        this.taskQueue = [];
    }
}

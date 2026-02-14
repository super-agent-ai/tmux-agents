import { AgentInstance, AgentRole, AgentState, AIProvider, AIStatus, OrchestratorTask, AgentMessage } from './types';
import { Event, Disposable } from './eventEmitter';
import type { TmuxService } from './tmuxService';
export interface ITmuxServiceManager {
    getService(serverId: string): TmuxService | undefined;
    getAllServices(): TmuxService[];
}
export interface IAIAssistantManager {
    detectAIStatus(provider: AIProvider, content: string): AIStatus;
    mapCcStateToAIStatus(ccState: string): AIStatus | null;
}
export declare class AgentOrchestrator implements Disposable {
    private agents;
    private taskQueue;
    private serviceManager;
    private aiAssistantManager;
    private pollingInterval;
    private readonly _onAgentStateChanged;
    readonly onAgentStateChanged: Event<AgentInstance>;
    private readonly _onTaskCompleted;
    readonly onTaskCompleted: Event<OrchestratorTask>;
    private readonly _onPipelineEvent;
    readonly onPipelineEvent: Event<{
        pipelineId: string;
        event: string;
    }>;
    private readonly _onAgentMessage;
    readonly onAgentMessage: Event<AgentMessage>;
    private messageQueue;
    constructor(aiAssistantManager: IAIAssistantManager);
    setServiceManager(sm: ITmuxServiceManager): void;
    registerAgent(agent: AgentInstance): void;
    removeAgent(agentId: string): void;
    getAgent(agentId: string): AgentInstance | undefined;
    getAllAgents(): AgentInstance[];
    getAgentsByRole(role: AgentRole): AgentInstance[];
    getAgentsByTeam(teamId: string): AgentInstance[];
    getIdleAgents(role?: AgentRole): AgentInstance[];
    submitTask(task: OrchestratorTask): void;
    cancelTask(taskId: string): void;
    getTaskQueue(): OrchestratorTask[];
    getTask(taskId: string): OrchestratorTask | undefined;
    dispatchNextTask(): Promise<void>;
    sendPromptToAgent(agentId: string, prompt: string): Promise<void>;
    captureAgentOutput(agentId: string, lines?: number): Promise<string>;
    getFanOutResults(stageId: string): OrchestratorTask[];
    sendMessage(fromAgentId: string, toAgentId: string, content: string): AgentMessage;
    getUnreadMessages(agentId: string): AgentMessage[];
    markMessageRead(messageId: string): void;
    getAllMessages(): AgentMessage[];
    getConversation(agentId1: string, agentId2: string): AgentMessage[];
    getIdleAgentsByExpertise(role: AgentRole, expertiseHint?: string): AgentInstance[];
    checkAgentStates(serviceManager: ITmuxServiceManager): Promise<void>;
    updateAgentState(agentId: string, newState: AgentState, error?: string): void;
    startPolling(serviceManager: ITmuxServiceManager, intervalMs: number): void;
    stopPolling(): void;
    dispose(): void;
}
//# sourceMappingURL=orchestrator.d.ts.map
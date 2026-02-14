import * as vscode from 'vscode';
import { AgentState, AIStatus, TaskStatus, } from './types';
import { AIAssistantManager } from './aiAssistant';
function generateId() {
    return crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
function evaluateAgentState(currentState, aiProvider, paneContent, aiAssistant) {
    const aiStatus = aiAssistant.detectAIStatus(aiProvider, paneContent);
    switch (aiStatus) {
        case AIStatus.WORKING:
            return AgentState.WORKING;
        case AIStatus.WAITING:
        case AIStatus.IDLE:
            return AgentState.IDLE;
        default:
            return currentState;
    }
}
export class AgentOrchestrator {
    constructor() {
        this.agents = new Map();
        this.taskQueue = [];
        this.aiAssistantManager = new AIAssistantManager();
        this._onAgentStateChanged = new vscode.EventEmitter();
        this.onAgentStateChanged = this._onAgentStateChanged.event;
        this._onTaskCompleted = new vscode.EventEmitter();
        this.onTaskCompleted = this._onTaskCompleted.event;
        this._onPipelineEvent = new vscode.EventEmitter();
        this.onPipelineEvent = this._onPipelineEvent.event;
        this._onAgentMessage = new vscode.EventEmitter();
        this.onAgentMessage = this._onAgentMessage.event;
        this.messageQueue = new Map();
    }
    // ─── Service Manager ────────────────────────────────────────────────
    setServiceManager(sm) {
        this.serviceManager = sm;
    }
    // ─── Agent Registry ─────────────────────────────────────────────────
    registerAgent(agent) {
        this.agents.set(agent.id, agent);
        this._onAgentStateChanged.fire(agent);
    }
    removeAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.state = AgentState.TERMINATED;
            this._onAgentStateChanged.fire(agent);
            this.agents.delete(agentId);
        }
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    getAgentsByRole(role) {
        return this.getAllAgents().filter(a => a.role === role);
    }
    getAgentsByTeam(teamId) {
        return this.getAllAgents().filter(a => a.teamId === teamId);
    }
    getIdleAgents(role) {
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
    submitTask(task) {
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);
    }
    cancelTask(taskId) {
        const task = this.taskQueue.find(t => t.id === taskId);
        if (task) {
            task.status = TaskStatus.CANCELLED;
            this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
        }
    }
    getTaskQueue() {
        return [...this.taskQueue];
    }
    getTask(taskId) {
        return this.taskQueue.find(t => t.id === taskId);
    }
    // ─── Task Dispatch ──────────────────────────────────────────────────
    async dispatchNextTask() {
        if (!this.serviceManager) {
            return;
        }
        // Find the highest-priority pending task
        const pendingTask = this.taskQueue.find(t => t.status === TaskStatus.PENDING);
        if (!pendingTask) {
            return;
        }
        // Find an idle agent matching the task's target role
        const idleAgents = pendingTask.targetRole
            ? this.getIdleAgentsByExpertise(pendingTask.targetRole, pendingTask.description)
            : this.getIdleAgents();
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            pendingTask.status = TaskStatus.FAILED;
            pendingTask.errorMessage = errorMessage;
            this.updateAgentState(agent.id, AgentState.ERROR, errorMessage);
        }
    }
    // ─── Agent Communication ────────────────────────────────────────────
    async sendPromptToAgent(agentId, prompt) {
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
    async captureAgentOutput(agentId, lines = 50) {
        if (!this.serviceManager) {
            return '';
        }
        const agent = this.agents.get(agentId);
        if (!agent) {
            return '';
        }
        const service = this.serviceManager.getService(agent.serverId);
        if (!service) {
            return '';
        }
        try {
            return await service.capturePaneContent(agent.sessionName, agent.windowIndex, agent.paneIndex, lines);
        }
        catch {
            return '';
        }
    }
    getFanOutResults(stageId) {
        return this.taskQueue.filter(t => t.pipelineStageId === stageId && t.status === TaskStatus.COMPLETED);
    }
    // ─── Agent Messaging ────────────────────────────────────────────────
    sendMessage(fromAgentId, toAgentId, content) {
        const msg = {
            id: generateId(),
            fromAgentId,
            toAgentId,
            content,
            timestamp: Date.now(),
            read: false,
        };
        if (!this.messageQueue.has(toAgentId)) {
            this.messageQueue.set(toAgentId, []);
        }
        this.messageQueue.get(toAgentId).push(msg);
        this._onAgentMessage.fire(msg);
        return msg;
    }
    getUnreadMessages(agentId) {
        const msgs = this.messageQueue.get(agentId) || [];
        return msgs.filter(m => !m.read);
    }
    markMessageRead(messageId) {
        for (const msgs of this.messageQueue.values()) {
            const msg = msgs.find(m => m.id === messageId);
            if (msg) {
                msg.read = true;
                break;
            }
        }
    }
    getAllMessages() {
        const all = [];
        for (const msgs of this.messageQueue.values()) {
            all.push(...msgs);
        }
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }
    getConversation(agentId1, agentId2) {
        const all = [];
        for (const msgs of this.messageQueue.values()) {
            for (const m of msgs) {
                if ((m.fromAgentId === agentId1 && m.toAgentId === agentId2) ||
                    (m.fromAgentId === agentId2 && m.toAgentId === agentId1)) {
                    all.push(m);
                }
            }
        }
        return all.sort((a, b) => a.timestamp - b.timestamp);
    }
    // ─── Specialization-Aware Dispatch ──────────────────────────────────
    getIdleAgentsByExpertise(role, expertiseHint) {
        const idle = this.getIdleAgents(role);
        if (!expertiseHint || idle.length <= 1) {
            return idle;
        }
        // Sort by expertise match: agents with matching expertise first
        return idle.sort((a, b) => {
            const aMatch = a.persona?.expertiseAreas?.some(e => expertiseHint.toLowerCase().includes(e.toLowerCase())) ? 1 : 0;
            const bMatch = b.persona?.expertiseAreas?.some(e => expertiseHint.toLowerCase().includes(e.toLowerCase())) ? 1 : 0;
            return bMatch - aMatch;
        });
    }
    // ─── State Monitoring ───────────────────────────────────────────────
    async checkAgentStates(serviceManager) {
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
                // Try @cc_* pane options first (cheap, single command)
                const paneTarget = `${agent.sessionName}:${agent.windowIndex}.${agent.paneIndex}`;
                const ccOptions = await service.getPaneOptions(paneTarget);
                const ccState = ccOptions['cc_state'];
                if (ccState) {
                    const aiStatus = this.aiAssistantManager.mapCcStateToAIStatus(ccState);
                    if (aiStatus !== null) {
                        let newState;
                        switch (aiStatus) {
                            case AIStatus.WORKING:
                                newState = AgentState.WORKING;
                                break;
                            case AIStatus.WAITING:
                            case AIStatus.IDLE:
                                newState = AgentState.IDLE;
                                break;
                            default:
                                newState = agent.state;
                        }
                        if (newState !== agent.state) {
                            this.updateAgentState(agent.id, newState);
                        }
                        continue;
                    }
                }
                // Fall back to capture-pane heuristic
                const content = await service.capturePaneContent(agent.sessionName, agent.windowIndex, agent.paneIndex, 50);
                const newState = evaluateAgentState(agent.state, agent.aiProvider, content, this.aiAssistantManager);
                if (newState !== agent.state) {
                    this.updateAgentState(agent.id, newState);
                }
            }
            catch {
                // If we can't read the pane, mark as error
                this.updateAgentState(agent.id, AgentState.ERROR, 'Failed to read pane content');
            }
        }
    }
    updateAgentState(agentId, newState, error) {
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
                task.kanbanColumn = 'done';
                this._onTaskCompleted.fire(task);
            }
            agent.currentTaskId = undefined;
        }
        this._onAgentStateChanged.fire(agent);
    }
    // ─── Polling ────────────────────────────────────────────────────────
    startPolling(serviceManager, intervalMs) {
        this.stopPolling();
        this.pollingInterval = setInterval(async () => {
            try {
                await this.checkAgentStates(serviceManager);
                await this.dispatchNextTask();
            }
            catch (error) {
                console.warn('Agent orchestrator polling error:', error);
            }
        }, intervalMs);
    }
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
        }
    }
    // ─── Dispose ────────────────────────────────────────────────────────
    dispose() {
        this.stopPolling();
        this._onAgentStateChanged.dispose();
        this._onTaskCompleted.dispose();
        this._onPipelineEvent.dispose();
        this._onAgentMessage.dispose();
        this.messageQueue.clear();
        this.agents.clear();
        this.taskQueue = [];
    }
}
//# sourceMappingURL=orchestrator.js.map
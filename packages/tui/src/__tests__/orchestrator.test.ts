import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator';
import { AgentInstance, AgentRole, AgentState, AIProvider, OrchestratorTask, TaskStatus } from '../types';

function makeAgent(id: string, overrides: Partial<AgentInstance> = {}): AgentInstance {
    return {
        id,
        templateId: 'tmpl-1',
        name: `Agent ${id}`,
        role: AgentRole.CODER,
        aiProvider: AIProvider.CLAUDE,
        state: AgentState.IDLE,
        serverId: 'local',
        sessionName: 'sess',
        windowIndex: '0',
        paneIndex: '0',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        ...overrides,
    };
}

function makeTask(id: string, overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
    return {
        id,
        description: `Task ${id}`,
        status: TaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        ...overrides,
    };
}

describe('AgentOrchestrator', () => {
    let orchestrator: AgentOrchestrator;

    beforeEach(() => {
        orchestrator = new AgentOrchestrator();
    });

    // ─── Agent Registry ──────────────────────────────────────────────────

    describe('registerAgent', () => {
        it('registers and retrieves an agent', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            expect(orchestrator.getAgent('a1')).toBe(agent);
        });

        it('returns all registered agents', () => {
            orchestrator.registerAgent(makeAgent('a1'));
            orchestrator.registerAgent(makeAgent('a2'));
            expect(orchestrator.getAllAgents()).toHaveLength(2);
        });
    });

    describe('removeAgent', () => {
        it('removes agent and marks as TERMINATED', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.removeAgent('a1');
            expect(orchestrator.getAgent('a1')).toBeUndefined();
            expect(agent.state).toBe(AgentState.TERMINATED);
        });

        it('does nothing for unknown agent', () => {
            orchestrator.removeAgent('unknown');
            expect(orchestrator.getAllAgents()).toHaveLength(0);
        });
    });

    describe('getAgentsByRole', () => {
        it('filters agents by role', () => {
            orchestrator.registerAgent(makeAgent('a1', { role: AgentRole.CODER }));
            orchestrator.registerAgent(makeAgent('a2', { role: AgentRole.REVIEWER }));
            orchestrator.registerAgent(makeAgent('a3', { role: AgentRole.CODER }));
            expect(orchestrator.getAgentsByRole(AgentRole.CODER)).toHaveLength(2);
            expect(orchestrator.getAgentsByRole(AgentRole.REVIEWER)).toHaveLength(1);
        });
    });

    describe('getIdleAgents', () => {
        it('returns only idle agents', () => {
            orchestrator.registerAgent(makeAgent('a1', { state: AgentState.IDLE }));
            orchestrator.registerAgent(makeAgent('a2', { state: AgentState.WORKING }));
            orchestrator.registerAgent(makeAgent('a3', { state: AgentState.IDLE }));
            expect(orchestrator.getIdleAgents()).toHaveLength(2);
        });

        it('filters by role when specified', () => {
            orchestrator.registerAgent(makeAgent('a1', { state: AgentState.IDLE, role: AgentRole.CODER }));
            orchestrator.registerAgent(makeAgent('a2', { state: AgentState.IDLE, role: AgentRole.REVIEWER }));
            expect(orchestrator.getIdleAgents(AgentRole.CODER)).toHaveLength(1);
        });
    });

    describe('getAgentsByTeam', () => {
        it('filters agents by teamId', () => {
            orchestrator.registerAgent(makeAgent('a1', { teamId: 'team1' }));
            orchestrator.registerAgent(makeAgent('a2', { teamId: 'team2' }));
            orchestrator.registerAgent(makeAgent('a3', { teamId: 'team1' }));
            expect(orchestrator.getAgentsByTeam('team1')).toHaveLength(2);
        });
    });

    // ─── Task Queue ──────────────────────────────────────────────────────

    describe('submitTask', () => {
        it('adds task to queue sorted by priority', () => {
            orchestrator.submitTask(makeTask('t1', { priority: 3 }));
            orchestrator.submitTask(makeTask('t2', { priority: 8 }));
            orchestrator.submitTask(makeTask('t3', { priority: 5 }));
            const queue = orchestrator.getTaskQueue();
            expect(queue[0].id).toBe('t2');
            expect(queue[1].id).toBe('t3');
            expect(queue[2].id).toBe('t1');
        });
    });

    describe('cancelTask', () => {
        it('removes task from queue and marks as cancelled', () => {
            const task = makeTask('t1');
            orchestrator.submitTask(task);
            orchestrator.cancelTask('t1');
            expect(orchestrator.getTaskQueue()).toHaveLength(0);
            expect(task.status).toBe(TaskStatus.CANCELLED);
        });

        it('does nothing for unknown task', () => {
            orchestrator.cancelTask('unknown');
            expect(orchestrator.getTaskQueue()).toHaveLength(0);
        });
    });

    describe('getTask', () => {
        it('retrieves task by id', () => {
            orchestrator.submitTask(makeTask('t1'));
            expect(orchestrator.getTask('t1')).toBeDefined();
            expect(orchestrator.getTask('t1')!.id).toBe('t1');
        });

        it('returns undefined for unknown task', () => {
            expect(orchestrator.getTask('unknown')).toBeUndefined();
        });
    });

    // ─── updateAgentState ────────────────────────────────────────────────

    describe('updateAgentState', () => {
        it('updates agent state', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.updateAgentState('a1', AgentState.WORKING);
            expect(orchestrator.getAgent('a1')!.state).toBe(AgentState.WORKING);
        });

        it('marks current task completed when agent becomes idle', () => {
            const agent = makeAgent('a1', { state: AgentState.WORKING, currentTaskId: 't1' });
            const task = makeTask('t1', { status: TaskStatus.IN_PROGRESS, assignedAgentId: 'a1' });
            orchestrator.registerAgent(agent);
            orchestrator.submitTask(task);
            orchestrator.updateAgentState('a1', AgentState.IDLE);
            expect(task.status).toBe(TaskStatus.COMPLETED);
            expect(task.completedAt).toBeDefined();
            expect(agent.currentTaskId).toBeUndefined();
        });

        it('sets error message when provided', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.updateAgentState('a1', AgentState.ERROR, 'Something went wrong');
            expect(agent.errorMessage).toBe('Something went wrong');
        });

        it('does nothing for unknown agent', () => {
            orchestrator.updateAgentState('unknown', AgentState.IDLE);
            // No error thrown
        });
    });

    // ─── dispose ─────────────────────────────────────────────────────────

    describe('dispose', () => {
        it('clears agents and task queue', () => {
            orchestrator.registerAgent(makeAgent('a1'));
            orchestrator.submitTask(makeTask('t1'));
            orchestrator.dispose();
            expect(orchestrator.getAllAgents()).toHaveLength(0);
            expect(orchestrator.getTaskQueue()).toHaveLength(0);
        });
    });
});

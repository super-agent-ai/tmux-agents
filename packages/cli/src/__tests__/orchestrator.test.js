"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const orchestrator_1 = require("../core/orchestrator");
const types_1 = require("../core/types");
function makeAgent(id, overrides = {}) {
    return {
        id,
        templateId: 'tmpl-1',
        name: `Agent ${id}`,
        role: types_1.AgentRole.CODER,
        aiProvider: types_1.AIProvider.CLAUDE,
        state: types_1.AgentState.IDLE,
        serverId: 'local',
        sessionName: 'sess',
        windowIndex: '0',
        paneIndex: '0',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        ...overrides,
    };
}
function makeTask(id, overrides = {}) {
    return {
        id,
        description: `Task ${id}`,
        status: types_1.TaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        ...overrides,
    };
}
(0, vitest_1.describe)('AgentOrchestrator', () => {
    let orchestrator;
    (0, vitest_1.beforeEach)(() => {
        orchestrator = new orchestrator_1.AgentOrchestrator();
    });
    // ─── Agent Registry ──────────────────────────────────────────────────
    (0, vitest_1.describe)('registerAgent', () => {
        (0, vitest_1.it)('registers and retrieves an agent', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            (0, vitest_1.expect)(orchestrator.getAgent('a1')).toBe(agent);
        });
        (0, vitest_1.it)('returns all registered agents', () => {
            orchestrator.registerAgent(makeAgent('a1'));
            orchestrator.registerAgent(makeAgent('a2'));
            (0, vitest_1.expect)(orchestrator.getAllAgents()).toHaveLength(2);
        });
    });
    (0, vitest_1.describe)('removeAgent', () => {
        (0, vitest_1.it)('removes agent and marks as TERMINATED', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.removeAgent('a1');
            (0, vitest_1.expect)(orchestrator.getAgent('a1')).toBeUndefined();
            (0, vitest_1.expect)(agent.state).toBe(types_1.AgentState.TERMINATED);
        });
        (0, vitest_1.it)('does nothing for unknown agent', () => {
            orchestrator.removeAgent('unknown');
            (0, vitest_1.expect)(orchestrator.getAllAgents()).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('getAgentsByRole', () => {
        (0, vitest_1.it)('filters agents by role', () => {
            orchestrator.registerAgent(makeAgent('a1', { role: types_1.AgentRole.CODER }));
            orchestrator.registerAgent(makeAgent('a2', { role: types_1.AgentRole.REVIEWER }));
            orchestrator.registerAgent(makeAgent('a3', { role: types_1.AgentRole.CODER }));
            (0, vitest_1.expect)(orchestrator.getAgentsByRole(types_1.AgentRole.CODER)).toHaveLength(2);
            (0, vitest_1.expect)(orchestrator.getAgentsByRole(types_1.AgentRole.REVIEWER)).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('getIdleAgents', () => {
        (0, vitest_1.it)('returns only idle agents', () => {
            orchestrator.registerAgent(makeAgent('a1', { state: types_1.AgentState.IDLE }));
            orchestrator.registerAgent(makeAgent('a2', { state: types_1.AgentState.WORKING }));
            orchestrator.registerAgent(makeAgent('a3', { state: types_1.AgentState.IDLE }));
            (0, vitest_1.expect)(orchestrator.getIdleAgents()).toHaveLength(2);
        });
        (0, vitest_1.it)('filters by role when specified', () => {
            orchestrator.registerAgent(makeAgent('a1', { state: types_1.AgentState.IDLE, role: types_1.AgentRole.CODER }));
            orchestrator.registerAgent(makeAgent('a2', { state: types_1.AgentState.IDLE, role: types_1.AgentRole.REVIEWER }));
            (0, vitest_1.expect)(orchestrator.getIdleAgents(types_1.AgentRole.CODER)).toHaveLength(1);
        });
    });
    (0, vitest_1.describe)('getAgentsByTeam', () => {
        (0, vitest_1.it)('filters agents by teamId', () => {
            orchestrator.registerAgent(makeAgent('a1', { teamId: 'team1' }));
            orchestrator.registerAgent(makeAgent('a2', { teamId: 'team2' }));
            orchestrator.registerAgent(makeAgent('a3', { teamId: 'team1' }));
            (0, vitest_1.expect)(orchestrator.getAgentsByTeam('team1')).toHaveLength(2);
        });
    });
    // ─── Task Queue ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('submitTask', () => {
        (0, vitest_1.it)('adds task to queue sorted by priority', () => {
            orchestrator.submitTask(makeTask('t1', { priority: 3 }));
            orchestrator.submitTask(makeTask('t2', { priority: 8 }));
            orchestrator.submitTask(makeTask('t3', { priority: 5 }));
            const queue = orchestrator.getTaskQueue();
            (0, vitest_1.expect)(queue[0].id).toBe('t2');
            (0, vitest_1.expect)(queue[1].id).toBe('t3');
            (0, vitest_1.expect)(queue[2].id).toBe('t1');
        });
    });
    (0, vitest_1.describe)('cancelTask', () => {
        (0, vitest_1.it)('removes task from queue and marks as cancelled', () => {
            const task = makeTask('t1');
            orchestrator.submitTask(task);
            orchestrator.cancelTask('t1');
            (0, vitest_1.expect)(orchestrator.getTaskQueue()).toHaveLength(0);
            (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.CANCELLED);
        });
        (0, vitest_1.it)('does nothing for unknown task', () => {
            orchestrator.cancelTask('unknown');
            (0, vitest_1.expect)(orchestrator.getTaskQueue()).toHaveLength(0);
        });
    });
    (0, vitest_1.describe)('getTask', () => {
        (0, vitest_1.it)('retrieves task by id', () => {
            orchestrator.submitTask(makeTask('t1'));
            (0, vitest_1.expect)(orchestrator.getTask('t1')).toBeDefined();
            (0, vitest_1.expect)(orchestrator.getTask('t1').id).toBe('t1');
        });
        (0, vitest_1.it)('returns undefined for unknown task', () => {
            (0, vitest_1.expect)(orchestrator.getTask('unknown')).toBeUndefined();
        });
    });
    // ─── updateAgentState ────────────────────────────────────────────────
    (0, vitest_1.describe)('updateAgentState', () => {
        (0, vitest_1.it)('updates agent state', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.updateAgentState('a1', types_1.AgentState.WORKING);
            (0, vitest_1.expect)(orchestrator.getAgent('a1').state).toBe(types_1.AgentState.WORKING);
        });
        (0, vitest_1.it)('marks current task completed when agent becomes idle', () => {
            const agent = makeAgent('a1', { state: types_1.AgentState.WORKING, currentTaskId: 't1' });
            const task = makeTask('t1', { status: types_1.TaskStatus.IN_PROGRESS, assignedAgentId: 'a1' });
            orchestrator.registerAgent(agent);
            orchestrator.submitTask(task);
            orchestrator.updateAgentState('a1', types_1.AgentState.IDLE);
            (0, vitest_1.expect)(task.status).toBe(types_1.TaskStatus.COMPLETED);
            (0, vitest_1.expect)(task.completedAt).toBeDefined();
            (0, vitest_1.expect)(agent.currentTaskId).toBeUndefined();
        });
        (0, vitest_1.it)('sets error message when provided', () => {
            const agent = makeAgent('a1');
            orchestrator.registerAgent(agent);
            orchestrator.updateAgentState('a1', types_1.AgentState.ERROR, 'Something went wrong');
            (0, vitest_1.expect)(agent.errorMessage).toBe('Something went wrong');
        });
        (0, vitest_1.it)('does nothing for unknown agent', () => {
            orchestrator.updateAgentState('unknown', types_1.AgentState.IDLE);
            // No error thrown
        });
    });
    // ─── dispose ─────────────────────────────────────────────────────────
    (0, vitest_1.describe)('dispose', () => {
        (0, vitest_1.it)('clears agents and task queue', () => {
            orchestrator.registerAgent(makeAgent('a1'));
            orchestrator.submitTask(makeTask('t1'));
            orchestrator.dispose();
            (0, vitest_1.expect)(orchestrator.getAllAgents()).toHaveLength(0);
            (0, vitest_1.expect)(orchestrator.getTaskQueue()).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=orchestrator.test.js.map
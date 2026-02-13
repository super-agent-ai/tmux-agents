// ─── Reconciler Tests ────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reconciler } from '../../daemon/reconciler';
import { Database } from '../../core/database';
import { AgentOrchestrator } from '../../core/orchestrator';
import { Logger } from '../../daemon/log';
import { AgentInstance, AgentState, AgentRole, AIProvider } from '../../core/types';
import * as cp from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
	exec: vi.fn(),
}));

describe('Reconciler', () => {
	let reconciler: Reconciler;
	let mockDb: any;
	let mockOrchestrator: any;
	let mockLogger: any;

	beforeEach(() => {
		mockDb = {
			getAllAgents: vi.fn(),
			saveAgent: vi.fn(),
		};

		mockOrchestrator = {
			registerAgent: vi.fn(),
		};

		mockLogger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		reconciler = new Reconciler(mockDb, mockOrchestrator, mockLogger);
	});

	it('should reconcile no agents when DB is empty', async () => {
		mockDb.getAllAgents.mockResolvedValue([]);

		const result = await reconciler.reconcile();

		expect(result.total).toBe(0);
		expect(result.reconnected).toBe(0);
		expect(result.lost).toBe(0);
		expect(result.errors).toHaveLength(0);
	});

	it('should skip terminated agents', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.TERMINATED,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'local',
				sessionName: 'session1',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		const result = await reconciler.reconcile();

		expect(result.total).toBe(0);
	});

	it('should reconnect alive agents', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.IDLE,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'local',
				sessionName: 'session1',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		// Mock successful tmux check
		const execMock = vi.mocked(cp.exec);
		execMock.mockImplementation((cmd: any, callback: any) => {
			callback(null, { stdout: 'exists\n', stderr: '' });
			return {} as any;
		});

		const result = await reconciler.reconcile();

		expect(result.total).toBe(1);
		expect(result.reconnected).toBe(1);
		expect(result.lost).toBe(0);
		expect(mockOrchestrator.registerAgent).toHaveBeenCalledWith(agents[0]);
		expect(mockDb.saveAgent).toHaveBeenCalled();
	});

	it('should mark dead agents as lost', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.WORKING,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'local',
				sessionName: 'dead-session',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		// Mock failed tmux check
		const execMock = vi.mocked(cp.exec);
		execMock.mockImplementation((cmd: any, callback: any) => {
			callback(null, { stdout: 'missing\n', stderr: '' });
			return {} as any;
		});

		const result = await reconciler.reconcile();

		expect(result.total).toBe(1);
		expect(result.reconnected).toBe(0);
		expect(result.lost).toBe(1);
		expect(mockDb.saveAgent).toHaveBeenCalled();
		const savedAgent = mockDb.saveAgent.mock.calls[0][0];
		expect(savedAgent.state).toBe(AgentState.ERROR);
		expect(savedAgent.errorMessage).toContain('lost');
	});

	it('should handle reconciliation errors gracefully', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.IDLE,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'local',
				sessionName: 'session1',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		// Mock exec error
		const execMock = vi.mocked(cp.exec);
		execMock.mockImplementation((cmd: any, callback: any) => {
			callback(new Error('Exec failed'));
			return {} as any;
		});

		const result = await reconciler.reconcile();

		// Error is caught internally, agent should be marked as lost
		expect(result.total).toBe(1);
		expect(result.lost).toBe(1);
	});

	it('should skip remote sessions', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.IDLE,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'remote:server1',
				sessionName: 'session1',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		const result = await reconciler.reconcile();

		// Remote agents should be marked as lost (not implemented yet)
		expect(result.total).toBe(1);
		expect(result.lost).toBe(1);
	});

	it('should handle multiple agents', async () => {
		const agents: AgentInstance[] = [
			{
				id: 'agent1',
				name: 'Agent 1',
				role: AgentRole.CODER,
				state: AgentState.IDLE,
				aiProvider: AIProvider.CLAUDE,
				serverId: 'local',
				sessionName: 'session1',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'coder',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
			{
				id: 'agent2',
				name: 'Agent 2',
				role: AgentRole.REVIEWER,
				state: AgentState.WORKING,
				aiProvider: AIProvider.GEMINI,
				serverId: 'local',
				sessionName: 'session2',
				windowIndex: '0',
				paneIndex: '0',
				templateId: 'reviewer',
				createdAt: Date.now(),
				lastActivityAt: Date.now(),
			},
		];
		mockDb.getAllAgents.mockResolvedValue(agents);

		// Mock: first session exists, second doesn't
		const execMock = vi.mocked(cp.exec);
		let callCount = 0;
		execMock.mockImplementation((cmd: any, callback: any) => {
			callCount++;
			if (callCount === 1) {
				callback(null, { stdout: 'exists\n', stderr: '' });
			} else {
				callback(null, { stdout: 'missing\n', stderr: '' });
			}
			return {} as any;
		});

		const result = await reconciler.reconcile();

		expect(result.total).toBe(2);
		expect(result.reconnected).toBe(1);
		expect(result.lost).toBe(1);
	});
});

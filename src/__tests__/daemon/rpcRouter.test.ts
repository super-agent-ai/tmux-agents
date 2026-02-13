// ─── RPC Router Tests ────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RpcRouter, JsonRpcRequest } from '../../daemon/rpcRouter';
import { Database } from '../../core/database';
import { AgentOrchestrator } from '../../core/orchestrator';
import { PipelineEngine } from '../../core/pipelineEngine';
import { HealthChecker } from '../../daemon/health';
import { DaemonConfig } from '../../daemon/config';
import { Logger } from '../../daemon/log';
import { AgentState, TaskStatus, AgentRole } from '../../core/types';

describe('RpcRouter', () => {
	let router: RpcRouter;
	let mockDb: any;
	let mockOrchestrator: any;
	let mockPipelineEngine: any;
	let mockHealthChecker: any;
	let mockConfig: DaemonConfig;
	let mockLogger: any;

	beforeEach(() => {
		mockDb = {
			getAllTasks: vi.fn().mockReturnValue([]),
			getTask: vi.fn(),
			saveTask: vi.fn(),
			deleteTask: vi.fn(),
			getAllTeams: vi.fn().mockReturnValue([]),
			saveTeam: vi.fn(),
			deleteTeam: vi.fn(),
			getAllPipelines: vi.fn().mockReturnValue([]),
			savePipeline: vi.fn(),
			getPipeline: vi.fn(),
			getPipelineRun: vi.fn(),
			getAllPipelineRuns: vi.fn().mockReturnValue([]),
			getAllSwimLanes: vi.fn().mockReturnValue([]),
			saveSwimLane: vi.fn(),
			deleteSwimLane: vi.fn(),
			getSwimLane: vi.fn(),
			saveAgent: vi.fn(),
		};

		mockOrchestrator = {
			getAllAgents: vi.fn().mockReturnValue([]),
			getAgent: vi.fn(),
			removeAgent: vi.fn(),
			submitTask: vi.fn(),
			cancelTask: vi.fn(),
		};

		mockPipelineEngine = {
			startPipeline: vi.fn(),
			pausePipeline: vi.fn(),
			resumePipeline: vi.fn(),
			cancelPipeline: vi.fn(),
		};

		mockHealthChecker = {
			getHealthReport: vi.fn().mockResolvedValue({
				overall: 'healthy',
				timestamp: new Date().toISOString(),
				uptime: 1000,
				components: [],
			}),
		};

		mockConfig = {
			httpPort: 3737,
			wsPort: 3738,
			runtimes: [],
		} as any;

		mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			error: vi.fn(),
		};

		router = new RpcRouter(
			mockDb,
			mockOrchestrator,
			mockPipelineEngine,
			mockHealthChecker,
			mockConfig,
			mockLogger
		);
	});

	it('should handle valid JSON-RPC request', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'task.list',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.jsonrpc).toBe('2.0');
		expect(response.id).toBe(1);
		expect(response.result).toBeDefined();
		expect(response.error).toBeUndefined();
	});

	it('should reject invalid jsonrpc version', async () => {
		const request: any = {
			jsonrpc: '1.0',
			method: 'task.list',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.error).toBeDefined();
		expect(response.error?.code).toBe(-32600);
	});

	it('should reject missing method', async () => {
		const request: any = {
			jsonrpc: '2.0',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.error).toBeDefined();
		expect(response.error?.code).toBe(-32600);
	});

	it('should reject unknown method', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'unknown.method',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.error).toBeDefined();
		expect(response.error?.code).toBe(-32601);
		expect(response.error?.message).toContain('Method not found');
	});

	it('should handle agent.list', async () => {
		mockOrchestrator.getAllAgents.mockReturnValue([
			{ id: 'agent1', role: AgentRole.CODER, state: AgentState.IDLE },
		]);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'agent.list',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toHaveLength(1);
		expect(response.result[0].id).toBe('agent1');
	});

	it('should filter agents by status', async () => {
		mockOrchestrator.getAllAgents.mockReturnValue([
			{ id: 'agent1', state: AgentState.IDLE },
			{ id: 'agent2', state: AgentState.WORKING },
		]);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'agent.list',
			params: { status: AgentState.IDLE },
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toHaveLength(1);
		expect(response.result[0].id).toBe('agent1');
	});

	it('should handle agent.get', async () => {
		const agent = { id: 'agent1', name: 'Agent 1' };
		mockOrchestrator.getAgent.mockReturnValue(agent);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'agent.get',
			params: { id: 'agent1' },
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toEqual(agent);
	});

	it('should handle agent.get not found', async () => {
		mockOrchestrator.getAgent.mockReturnValue(undefined);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'agent.get',
			params: { id: 'nonexistent' },
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.error).toBeDefined();
		expect(response.error?.message).toContain('not found');
	});

	it('should handle task.submit', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'task.submit',
			params: { description: 'Test task', priority: 5 },
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toBeDefined();
		expect(response.result.description).toBe('Test task');
		expect(mockDb.saveTask).toHaveBeenCalled();
		expect(mockOrchestrator.submitTask).toHaveBeenCalled();
	});

	it('should handle task.move', async () => {
		const task = {
			id: 'task1',
			description: 'Test',
			status: TaskStatus.PENDING,
			kanbanColumn: 'todo',
		};
		mockDb.getTask.mockReturnValue(task);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'task.move',
			params: { id: 'task1', column: 'doing' },
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toBeUndefined();
		expect(mockDb.saveTask).toHaveBeenCalled();
	});

	it('should handle daemon.health', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'daemon.health',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result.overall).toBe('healthy');
		expect(mockHealthChecker.getHealthReport).toHaveBeenCalled();
	});

	it('should handle daemon.config', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'daemon.config',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result).toEqual(mockConfig);
	});

	it('should handle daemon.stats', async () => {
		mockOrchestrator.getAllAgents.mockReturnValue([
			{ state: AgentState.IDLE },
			{ state: AgentState.WORKING },
			{ state: AgentState.IDLE },
		]);

		mockDb.getAllTasks.mockReturnValue([
			{ status: TaskStatus.PENDING },
			{ status: TaskStatus.IN_PROGRESS },
			{ status: TaskStatus.COMPLETED },
		]);

		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'daemon.stats',
			id: 1,
		};

		const response = await router.handle(request);

		expect(response.result.agents.total).toBe(3);
		expect(response.result.agents.idle).toBe(2);
		expect(response.result.agents.working).toBe(1);
		expect(response.result.tasks.total).toBe(3);
	});

	it('should log requests and responses', async () => {
		const request: JsonRpcRequest = {
			jsonrpc: '2.0',
			method: 'task.list',
			id: 1,
		};

		await router.handle(request);

		expect(mockLogger.debug).toHaveBeenCalledWith(
			'rpc',
			expect.stringContaining('Request'),
			expect.any(Object)
		);
		expect(mockLogger.debug).toHaveBeenCalledWith(
			'rpc',
			expect.stringContaining('Response'),
			expect.any(Object)
		);
	});
});

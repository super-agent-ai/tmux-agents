// ─── JSON-RPC Router ─────────────────────────────────────────────────────────

import { Database } from '../core/database';
import { AgentOrchestrator } from '../core/orchestrator';
import { PipelineEngine } from '../core/pipelineEngine';
import { Logger } from './log';
import { HealthChecker } from './health';
import { DaemonConfig } from './config';
import {
	AgentInstance,
	AgentRole,
	AgentState,
	AIProvider,
	OrchestratorTask,
	TaskStatus,
	KanbanSwimLane,
	AgentTeam,
	Pipeline,
	PipelineRun,
	PipelineStatus,
} from '../core/types';

export interface JsonRpcRequest {
	jsonrpc: '2.0';
	method: string;
	params?: any;
	id?: string | number | null;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	result?: any;
	error?: JsonRpcError;
	id?: string | number | null;
}

export interface JsonRpcError {
	code: number;
	message: string;
	data?: any;
}

type RpcHandler = (params: any) => Promise<any>;

/**
 * RpcRouter - Maps JSON-RPC method names to handler functions
 */
export class RpcRouter {
	private handlers = new Map<string, RpcHandler>();

	constructor(
		private db: Database,
		private orchestrator: AgentOrchestrator,
		private pipelineEngine: PipelineEngine,
		private healthChecker: HealthChecker,
		private config: DaemonConfig,
		private logger: Logger
	) {
		this.registerHandlers();
	}

	/**
	 * Register all RPC method handlers
	 */
	private registerHandlers(): void {
		// ─── Agent Methods ───────────────────────────────────────────────
		this.register('agent.list', this.agentList.bind(this));
		this.register('agent.get', this.agentGet.bind(this));
		this.register('agent.spawn', this.agentSpawn.bind(this));
		this.register('agent.kill', this.agentKill.bind(this));
		this.register('agent.sendPrompt', this.agentSendPrompt.bind(this));
		this.register('agent.getOutput', this.agentGetOutput.bind(this));
		this.register('agent.getStatus', this.agentGetStatus.bind(this));
		this.register('agent.getAttachCommand', this.agentGetAttachCommand.bind(this));

		// ─── Task Methods ────────────────────────────────────────────────
		this.register('task.list', this.taskList.bind(this));
		this.register('task.get', this.taskGet.bind(this));
		this.register('task.submit', this.taskSubmit.bind(this));
		this.register('task.move', this.taskMove.bind(this));
		this.register('task.cancel', this.taskCancel.bind(this));
		this.register('task.delete', this.taskDelete.bind(this));
		this.register('task.update', this.taskUpdate.bind(this));

		// ─── Team Methods ────────────────────────────────────────────────
		this.register('team.list', this.teamList.bind(this));
		this.register('team.create', this.teamCreate.bind(this));
		this.register('team.delete', this.teamDelete.bind(this));
		this.register('team.addAgent', this.teamAddAgent.bind(this));
		this.register('team.removeAgent', this.teamRemoveAgent.bind(this));
		this.register('team.quickCode', this.teamQuickCode.bind(this));
		this.register('team.quickResearch', this.teamQuickResearch.bind(this));

		// ─── Pipeline Methods ────────────────────────────────────────────
		this.register('pipeline.list', this.pipelineList.bind(this));
		this.register('pipeline.create', this.pipelineCreate.bind(this));
		this.register('pipeline.run', this.pipelineRun.bind(this));
		this.register('pipeline.getStatus', this.pipelineGetStatus.bind(this));
		this.register('pipeline.getActive', this.pipelineGetActive.bind(this));
		this.register('pipeline.pause', this.pipelinePause.bind(this));
		this.register('pipeline.resume', this.pipelineResume.bind(this));
		this.register('pipeline.cancel', this.pipelineCancel.bind(this));

		// ─── Kanban Methods ──────────────────────────────────────────────
		this.register('kanban.listLanes', this.kanbanListLanes.bind(this));
		this.register('kanban.createLane', this.kanbanCreateLane.bind(this));
		this.register('kanban.editLane', this.kanbanEditLane.bind(this));
		this.register('kanban.deleteLane', this.kanbanDeleteLane.bind(this));
		this.register('kanban.getBoard', this.kanbanGetBoard.bind(this));
		this.register('kanban.startTask', this.kanbanStartTask.bind(this));
		this.register('kanban.stopTask', this.kanbanStopTask.bind(this));

		// ─── Runtime Methods ─────────────────────────────────────────────
		this.register('runtime.list', this.runtimeList.bind(this));
		this.register('runtime.add', this.runtimeAdd.bind(this));
		this.register('runtime.remove', this.runtimeRemove.bind(this));
		this.register('runtime.ping', this.runtimePing.bind(this));

		// ─── Daemon Methods ──────────────────────────────────────────────
		this.register('daemon.health', this.daemonHealth.bind(this));
		this.register('daemon.config', this.daemonConfig.bind(this));
		this.register('daemon.reload', this.daemonReload.bind(this));
		this.register('daemon.stats', this.daemonStats.bind(this));
		this.register('daemon.shutdown', this.daemonShutdown.bind(this));

		// ─── Fanout Methods ──────────────────────────────────────────────
		this.register('fanout.run', this.fanoutRun.bind(this));
	}

	/**
	 * Register a handler for a method
	 */
	private register(method: string, handler: RpcHandler): void {
		this.handlers.set(method, handler);
	}

	/**
	 * Handle incoming JSON-RPC request
	 */
	async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		const startTime = Date.now();

		this.logger.debug('rpc', `Request: ${request.method}`, {
			method: request.method,
			params: request.params,
		});

		// Validate request
		if (request.jsonrpc !== '2.0') {
			return this.errorResponse(request.id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
		}

		if (!request.method || typeof request.method !== 'string') {
			return this.errorResponse(request.id, -32600, 'Invalid Request: method required');
		}

		// Find handler
		const handler = this.handlers.get(request.method);
		if (!handler) {
			return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
		}

		// Execute handler
		try {
			const result = await handler(request.params || {});
			const duration = Date.now() - startTime;

			this.logger.debug('rpc', `Response: ${request.method}`, {
				method: request.method,
				duration,
			});

			return {
				jsonrpc: '2.0',
				result,
				id: request.id,
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			this.logger.error('rpc', `Error: ${request.method}`, {
				method: request.method,
				error: String(error),
				duration,
			});

			return this.errorResponse(request.id, -32000, `Application error: ${error}`);
		}
	}

	/**
	 * Create error response
	 */
	private errorResponse(id: any, code: number, message: string, data?: any): JsonRpcResponse {
		return {
			jsonrpc: '2.0',
			error: { code, message, data },
			id,
		};
	}

	// ─── Agent Handlers ──────────────────────────────────────────────────────

	private async agentList(params: {
		status?: AgentState;
		role?: AgentRole;
		team?: string;
		runtime?: string;
	}): Promise<AgentInstance[]> {
		let agents = this.orchestrator.getAllAgents();

		if (params.status) {
			agents = agents.filter(a => a.state === params.status);
		}
		if (params.role) {
			agents = agents.filter(a => a.role === params.role);
		}
		if (params.team) {
			agents = agents.filter(a => a.teamId === params.team);
		}
		// runtime filtering would be implemented with RuntimeManager

		return agents;
	}

	private async agentGet(params: { id: string }): Promise<AgentInstance> {
		const agent = this.orchestrator.getAgent(params.id);
		if (!agent) {
			throw new Error(`Agent not found: ${params.id}`);
		}
		return agent;
	}

	private async agentSpawn(params: {
		role: AgentRole;
		task: string;
		provider?: AIProvider;
		runtime?: string;
		workdir?: string;
		image?: string;
		memory?: string;
		cpus?: string;
		team?: string;
	}): Promise<AgentInstance> {
		// This would integrate with RuntimeManager to spawn agents
		// For now, return a placeholder
		throw new Error('agent.spawn not yet implemented (requires RuntimeManager)');
	}

	private async agentKill(params: { id: string }): Promise<void> {
		const agent = this.orchestrator.getAgent(params.id);
		if (!agent) {
			throw new Error(`Agent not found: ${params.id}`);
		}
		this.orchestrator.removeAgent(params.id);
		agent.state = AgentState.TERMINATED;
		this.db.saveAgent(agent);
	}

	private async agentSendPrompt(params: {
		id: string;
		prompt: string;
		wait?: boolean;
	}): Promise<string | void> {
		// This would send input to the agent's tmux pane
		throw new Error('agent.sendPrompt not yet implemented (requires TmuxService)');
	}

	private async agentGetOutput(params: { id: string; lines?: number }): Promise<string> {
		// This would capture pane content
		throw new Error('agent.getOutput not yet implemented (requires TmuxService)');
	}

	private async agentGetStatus(params: { id: string }): Promise<string> {
		const agent = this.orchestrator.getAgent(params.id);
		if (!agent) {
			throw new Error(`Agent not found: ${params.id}`);
		}
		return agent.state;
	}

	private async agentGetAttachCommand(params: { id: string }): Promise<string> {
		const agent = this.orchestrator.getAgent(params.id);
		if (!agent) {
			throw new Error(`Agent not found: ${params.id}`);
		}
		return `tmux attach-session -t ${agent.sessionName} \\; select-window -t ${agent.windowIndex} \\; select-pane -t ${agent.paneIndex}`;
	}

	// ─── Task Handlers ───────────────────────────────────────────────────────

	private async taskList(params: { column?: string; lane?: string }): Promise<OrchestratorTask[]> {
		const tasks = await this.db.getAllTasks();
		let filtered = tasks;

		if (params.column) {
			filtered = filtered.filter(t => t.kanbanColumn === params.column);
		}
		if (params.lane) {
			filtered = filtered.filter(t => t.swimLaneId === params.lane);
		}

		return filtered;
	}

	private async taskGet(params: { id: string }): Promise<OrchestratorTask> {
		const task = await this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		return task;
	}

	private async taskSubmit(params: {
		description: string;
		priority?: number;
		role?: AgentRole;
		lane?: string;
	}): Promise<OrchestratorTask> {
		const task: OrchestratorTask = {
			id: crypto.randomUUID?.() || `task-${Date.now()}`,
			description: params.description,
			priority: params.priority ?? 5,
			targetRole: params.role,
			swimLaneId: params.lane,
			status: TaskStatus.PENDING,
			kanbanColumn: 'backlog',
			createdAt: Date.now(),
		};

		this.db.saveTask(task);

		// Submit to orchestrator
		this.orchestrator.submitTask(task);

		return task;
	}

	private async taskMove(params: { id: string; column: string }): Promise<void> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		task.kanbanColumn = params.column as OrchestratorTask['kanbanColumn'];
		this.db.saveTask(task);
	}

	private async taskCancel(params: { id: string }): Promise<void> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		task.status = TaskStatus.CANCELLED;
		this.db.saveTask(task);
		this.orchestrator.cancelTask(params.id);
	}

	private async taskDelete(params: { id: string }): Promise<void> {
		this.db.deleteTask(params.id);
	}

	private async taskUpdate(params: { id: string; [key: string]: any }): Promise<OrchestratorTask> {
		const { id, ...updates } = params;
		const task = this.db.getTask(id);
		if (!task) {
			throw new Error(`Task not found: ${id}`);
		}
		Object.assign(task, updates);
		this.db.saveTask(task);
		return task;
	}

	// ─── Team Handlers ───────────────────────────────────────────────────────

	private async teamList(params: {}): Promise<AgentTeam[]> {
		return await this.db.getAllTeams();
	}

	private async teamCreate(params: {
		name: string;
		agents?: string[];
		workdir?: string;
		runtime?: string;
	}): Promise<AgentTeam> {
		const team: AgentTeam = {
			id: crypto.randomUUID?.() || `team-${Date.now()}`,
			name: params.name,
			description: '',
			agents: params.agents || [],
			createdAt: Date.now(),
		};

		this.db.saveTeam(team);

		return team;
	}

	private async teamDelete(params: { id: string }): Promise<void> {
		this.db.deleteTeam(params.id);
	}

	private async teamAddAgent(params: { teamId: string; agentId: string }): Promise<void> {
		// This would need a team_agents junction table operation
		// For now, update the agent's teamId
		const agent = this.orchestrator.getAgent(params.agentId);
		if (agent) {
			agent.teamId = params.teamId;
			this.db.saveAgent(agent);
		}
	}

	private async teamRemoveAgent(params: { teamId: string; agentId: string }): Promise<void> {
		const agent = this.orchestrator.getAgent(params.agentId);
		if (agent && agent.teamId === params.teamId) {
			agent.teamId = undefined;
			this.db.saveAgent(agent);
		}
	}

	private async teamQuickCode(params: { workdir: string; runtime?: string }): Promise<AgentTeam> {
		// Create a quick coding team (frontend + backend + reviewer)
		const team: AgentTeam = {
			id: crypto.randomUUID?.() || `team-${Date.now()}`,
			name: `Code Team - ${new Date().toISOString().split('T')[0]}`,
			description: 'Quick coding team with frontend, backend, and reviewer agents',
			agents: [],
			createdAt: Date.now(),
		};
		this.db.saveTeam(team);
		return team;
	}

	private async teamQuickResearch(params: { topic: string; runtime?: string }): Promise<AgentTeam> {
		// Create a quick research team (researcher + summarizer)
		const team: AgentTeam = {
			id: crypto.randomUUID?.() || `team-${Date.now()}`,
			name: `Research Team - ${params.topic}`,
			description: `Research team for topic: ${params.topic}`,
			agents: [],
			createdAt: Date.now(),
		};
		this.db.saveTeam(team);
		return team;
	}

	// ─── Pipeline Handlers ───────────────────────────────────────────────────

	private async pipelineList(params: {}): Promise<Pipeline[]> {
		return await this.db.getAllPipelines();
	}

	private async pipelineCreate(params: {
		name?: string;
		stages?: any[];
		description?: string;
	}): Promise<Pipeline> {
		const pipeline: Pipeline = {
			id: crypto.randomUUID?.() || `pipeline-${Date.now()}`,
			name: params.name || `Pipeline ${Date.now()}`,
			description: params.description || '',
			stages: params.stages || [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.db.savePipeline(pipeline);
		return pipeline;
	}

	private async pipelineRun(params: { id: string }): Promise<{ runId: string }> {
		const pipeline = this.db.getPipeline(params.id);
		if (!pipeline) {
			throw new Error(`Pipeline not found: ${params.id}`);
		}

		// Start pipeline execution - creates run and starts it
		const run = this.pipelineEngine.startRun(params.id);

		this.logger.info('rpc', `Started pipeline run ${run.id} for pipeline ${params.id}`);

		return { runId: run.id };
	}

	private async pipelineGetStatus(params: { runId: string }): Promise<PipelineRun> {
		const run = this.db.getPipelineRun(params.runId);
		if (!run) {
			throw new Error(`Pipeline run not found: ${params.runId}`);
		}
		return run;
	}

	private async pipelineGetActive(params: {}): Promise<PipelineRun[]> {
		const runs = this.db.getAllPipelineRuns();
		return runs.filter(r => r.status === 'running' || r.status === 'paused');
	}

	private async pipelinePause(params: { runId: string }): Promise<void> {
		await this.pipelineEngine.pauseRun(params.runId);
		this.logger.info('rpc', `Paused pipeline run ${params.runId}`);
	}

	private async pipelineResume(params: { runId: string }): Promise<void> {
		await this.pipelineEngine.resumeRun(params.runId);
		this.logger.info('rpc', `Resumed pipeline run ${params.runId}`);
	}

	private async pipelineCancel(params: { runId: string }): Promise<void> {
		const run = this.db.getPipelineRun(params.runId);
		if (!run) {
			throw new Error(`Pipeline run not found: ${params.runId}`);
		}

		// Update run status to failed (closest to cancelled)
		run.status = PipelineStatus.FAILED;
		run.completedAt = Date.now();
		this.db.savePipelineRun(run);

		this.logger.info('rpc', `Cancelled pipeline run ${params.runId}`);
	}

	// ─── Kanban Handlers ─────────────────────────────────────────────────────

	private async kanbanListLanes(params: {}): Promise<KanbanSwimLane[]> {
		return await this.db.getAllSwimLanes();
	}

	private async kanbanCreateLane(params: {
		name: string;
		workdir?: string;
		provider?: AIProvider;
		runtime?: string;
	}): Promise<KanbanSwimLane> {
		const lane: KanbanSwimLane = {
			id: crypto.randomUUID?.() || `lane-${Date.now()}`,
			name: params.name,
			serverId: 'local',
			workingDirectory: params.workdir || process.cwd(),
			sessionName: `lane-${Date.now()}`,
			createdAt: Date.now(),
			sessionActive: false,
			aiProvider: params.provider,
		};
		this.db.saveSwimLane(lane);
		return lane;
	}

	private async kanbanEditLane(params: { id: string; [key: string]: any }): Promise<KanbanSwimLane> {
		const { id, ...updates } = params;
		const lane = this.db.getSwimLane(id);
		if (!lane) {
			throw new Error(`Lane not found: ${id}`);
		}
		Object.assign(lane, updates);
		this.db.saveSwimLane(lane);
		return lane;
	}

	private async kanbanDeleteLane(params: { id: string }): Promise<void> {
		this.db.deleteSwimLane(params.id);
	}

	private async kanbanGetBoard(params: { lane?: string }): Promise<any> {
		const tasks = await this.taskList({ lane: params.lane });

		// Group by column
		const board: Record<string, OrchestratorTask[]> = {
			backlog: [],
			todo: [],
			in_progress: [],
			in_review: [],
			done: [],
		};

		for (const task of tasks) {
			const column = task.kanbanColumn || 'backlog';
			if (!board[column]) {
				board[column] = [];
			}
			board[column].push(task);
		}

		return board;
	}

	private async kanbanStartTask(params: { id: string }): Promise<void> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		task.status = TaskStatus.IN_PROGRESS;
		task.kanbanColumn = 'in_progress';
		task.startedAt = Date.now();
		this.db.saveTask(task);
	}

	private async kanbanStopTask(params: { id: string }): Promise<void> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		task.status = TaskStatus.COMPLETED;
		task.kanbanColumn = 'done';
		task.completedAt = Date.now();
		this.db.saveTask(task);
	}

	// ─── Runtime Handlers ────────────────────────────────────────────────────

	private async runtimeList(params: {}): Promise<any[]> {
		return this.config.runtimes;
	}

	private async runtimeAdd(params: { id: string; type: string; [key: string]: any }): Promise<void> {
		// This would persist to config file
		this.config.runtimes.push(params as any);
	}

	private async runtimeRemove(params: { id: string }): Promise<void> {
		this.config.runtimes = this.config.runtimes.filter(r => r.id !== params.id);
	}

	private async runtimePing(params: { id: string }): Promise<{ ok: boolean; latency?: number }> {
		const runtime = this.config.runtimes.find(r => r.id === params.id);
		if (!runtime) {
			throw new Error(`Runtime not found: ${params.id}`);
		}

		const start = Date.now();
		const health = await this.healthChecker.getHealthReport(this.db, [runtime]);
		const component = health.components.find(c => c.name === `runtime:${params.id}`);

		return {
			ok: component?.status === 'healthy',
			latency: component?.latency,
		};
	}

	// ─── Daemon Handlers ─────────────────────────────────────────────────────

	private async daemonHealth(params: {}): Promise<any> {
		return await this.healthChecker.getHealthReport(this.db, this.config.runtimes);
	}

	private async daemonConfig(params: {}): Promise<DaemonConfig> {
		return this.config;
	}

	private async daemonReload(params: {}): Promise<void> {
		// Reload config would be handled by supervisor via SIGHUP
		throw new Error('daemon.reload not yet implemented');
	}

	private async daemonStats(params: {}): Promise<any> {
		const agents = this.orchestrator.getAllAgents();
		const tasks = await this.db.getAllTasks();

		return {
			agents: {
				total: agents.length,
				idle: agents.filter(a => a.state === AgentState.IDLE).length,
				working: agents.filter(a => a.state === AgentState.WORKING).length,
			},
			tasks: {
				total: tasks.length,
				pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
				in_progress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
				completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
			},
		};
	}

	private async daemonShutdown(params: {}): Promise<void> {
		// Trigger graceful shutdown
		process.emit('SIGTERM' as any);
	}

	// ─── Fanout Handlers ─────────────────────────────────────────────────────

	private async fanoutRun(params: {
		prompt: string;
		count?: number;
		provider?: AIProvider;
		runtime?: string;
	}): Promise<string[]> {
		// Spawn N agents with the same prompt and collect results
		throw new Error('fanout.run not yet implemented');
	}
}

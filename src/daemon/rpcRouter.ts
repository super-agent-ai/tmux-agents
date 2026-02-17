// ─── JSON-RPC Router ─────────────────────────────────────────────────────────

import * as cp from 'child_process';
import { Database } from '../core/database';
import { AgentOrchestrator } from '../core/orchestrator';
import { PipelineEngine } from '../core/pipelineEngine';
import { AIAssistantManager } from '../core/aiAssistant';
import { Logger } from './log';
import { HealthChecker } from './health';
import { DaemonConfig, RuntimeConfig } from './config';
import {
	AgentInstance,
	AgentRole,
	AgentState,
	AIProvider,
	OrchestratorTask,
	TaskStatus,
	KanbanSwimLane,
	SwimLaneDefaultToggles,
	AgentTeam,
	Pipeline,
	PipelineRun,
	PipelineStatus,
	CustomRole,
	resolveToggle,
	TmuxSession,
} from '../core/types';
import { BackendRegistry } from '../backends/backendRegistry';
import { TaskSyncService } from '../sync/taskSyncService';
import { BackendStatus, SyncReport } from '../backends/types';
import { EventBus } from '../core/eventBus';
import { DaemonTmuxServiceManager } from './tmuxServiceManager';
import { buildTaskWindowName, ensureLaneSession, cleanupInitWindow } from '../core/taskLauncher';
import { buildSingleTaskPrompt, buildTaskBoxPrompt, buildBundleTaskPrompt, appendPromptTail, buildRolePersonaContext, buildPersonaContext } from '../core/promptBuilder';
import {
	ensureMemoryDir,
	readMemoryFile,
	getMemoryFilePath,
	buildMemoryLoadPrompt,
	buildMemorySavePrompt,
} from '../core/memoryManager';

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

	private aiManager: AIAssistantManager;

	constructor(
		private db: Database,
		private orchestrator: AgentOrchestrator,
		private pipelineEngine: PipelineEngine,
		private healthChecker: HealthChecker,
		private config: DaemonConfig,
		private logger: Logger,
		private backendRegistry?: BackendRegistry,
		private syncService?: TaskSyncService,
		private eventBus?: EventBus,
		private tmuxServices?: DaemonTmuxServiceManager,
	) {
		this.aiManager = new AIAssistantManager({
			defaultProvider: config.defaultProvider as AIProvider,
			fallbackProvider: config.fallbackProvider as AIProvider,
			aiProviders: config.aiProviders as any,
			defaultWorkingDirectory: config.defaultWorkingDirectory || undefined,
		});
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
		this.register('task.save', this.taskSave.bind(this));
		this.register('task.getOutput', this.taskGetOutput.bind(this));

		// ─── AI Methods ─────────────────────────────────────────────
		this.register('ai.resolveConfig', this.aiResolveConfig.bind(this));
		this.register('ai.getSpawnConfig', this.aiGetSpawnConfig.bind(this));
		this.register('ai.summarize', this.aiSummarize.bind(this));

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
		this.register('kanban.saveLane', this.kanbanSaveLane.bind(this));
		this.register('kanban.getBoard', this.kanbanGetBoard.bind(this));
		this.register('kanban.startTask', this.kanbanStartTask.bind(this));
		this.register('kanban.stopTask', this.kanbanStopTask.bind(this));
		this.register('kanban.restartTask', this.kanbanRestartTask.bind(this));
		this.register('kanban.startBundle', this.kanbanStartBundle.bind(this));
		this.register('kanban.closeTaskWindow', this.kanbanCloseTaskWindow.bind(this));
		this.register('kanban.cleanupWorktree', this.kanbanCleanupWorktree.bind(this));

		// ─── Runtime Methods ─────────────────────────────────────────────
		this.register('runtime.list', this.runtimeList.bind(this));
		this.register('runtime.add', this.runtimeAdd.bind(this));
		this.register('runtime.remove', this.runtimeRemove.bind(this));
		this.register('runtime.ping', this.runtimePing.bind(this));
		this.register('runtime.register', this.runtimeRegister.bind(this));

		// ─── Daemon Methods ──────────────────────────────────────────────
		this.register('daemon.health', this.daemonHealth.bind(this));
		this.register('daemon.config', this.daemonConfig.bind(this));
		this.register('daemon.reload', this.daemonReload.bind(this));
		this.register('daemon.stats', this.daemonStats.bind(this));
		this.register('daemon.shutdown', this.daemonShutdown.bind(this));

		// ─── Role Methods ───────────────────────────────────────────────
		this.register('role.list', this.roleList.bind(this));
		this.register('role.create', this.roleCreate.bind(this));
		this.register('role.update', this.roleUpdate.bind(this));
		this.register('role.delete', this.roleDelete.bind(this));

		// ─── Fanout Methods ──────────────────────────────────────────────
		this.register('fanout.run', this.fanoutRun.bind(this));

		// ─── Backend Methods ─────────────────────────────────────────────
		this.register('backend.list', this.backendList.bind(this));
		this.register('backend.add', this.backendAdd.bind(this));
		this.register('backend.remove', this.backendRemove.bind(this));
		this.register('backend.enable', this.backendEnable.bind(this));
		this.register('backend.disable', this.backendDisable.bind(this));
		this.register('backend.sync', this.backendSync.bind(this));
		this.register('backend.status', this.backendStatus.bind(this));
		this.register('backend.retryErrors', this.backendRetryErrors.bind(this));

		// ─── Tmux Methods ───────────────────────────────────────────────
		this.register('tmux.getTree', this.tmuxGetTree.bind(this));

		// ─── Generic DB Proxy ────────────────────────────────────────────
		this.register('db.call', this.dbCall.bind(this));
		this.register('db.snapshot', this.dbSnapshot.bind(this));
	}

	/**
	 * Register a handler for a method
	 */
	private register(method: string, handler: RpcHandler): void {
		this.handlers.set(method, handler);
	}

	/**
	 * Call a registered handler directly (no HTTP/socket transport).
	 * Used by DaemonAutoMonitor to trigger task starts from within the daemon.
	 */
	async handleInternal(method: string, params: any = {}): Promise<any> {
		const handler = this.handlers.get(method);
		if (!handler) {
			throw new Error(`Method not found: ${method}`);
		}
		return handler(params);
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

			const errMsg = error instanceof Error ? error.message : String(error);
			return this.errorResponse(request.id, -32000, errMsg);
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

	private async agentSpawn(_params: {
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

	private async agentSendPrompt(_params: {
		id: string;
		prompt: string;
		wait?: boolean;
	}): Promise<string | void> {
		// This would send input to the agent's tmux pane
		throw new Error('agent.sendPrompt not yet implemented (requires TmuxService)');
	}

	private async agentGetOutput(params: { id: string; lines?: number }): Promise<string> {
		const agent = this.orchestrator.getAgent(params.id);
		if (!agent) {
			throw new Error(`Agent not found: ${params.id}`);
		}
		if (!this.tmuxServices || !agent.sessionName || !agent.windowIndex || !agent.paneIndex) {
			throw new Error('Agent has no tmux session info');
		}
		const serverId = (agent as any).serverId || 'local';
		const service = this.tmuxServices.getService(serverId);
		if (!service) {
			throw new Error(`Runtime not found: ${serverId}`);
		}
		return service.capturePaneContent(
			agent.sessionName,
			String(agent.windowIndex),
			String(agent.paneIndex),
			params.lines || 50,
		);
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
		// Validate session name to prevent shell injection - only allow safe characters
		const safeNamePattern = /^[a-zA-Z0-9_\-:.]+$/;
		if (!agent.sessionName || !safeNamePattern.test(agent.sessionName)) {
			throw new Error(`Invalid session name: contains disallowed characters`);
		}
		return `tmux attach-session -t ${agent.sessionName} \\; select-window -t ${agent.windowIndex} \\; select-pane -t ${agent.paneIndex}`;
	}

	// ─── Task Handlers ───────────────────────────────────────────────────────

	private async taskList(params: { column?: string; lane?: string }): Promise<OrchestratorTask[]> {
		const tasks = this.db.getAllTasks();
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
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		return task;
	}

	private async taskSubmit(params: {
		title?: string;
		description: string;
		priority?: string | number;
		role?: AgentRole;
		lane?: string;
		column?: string;
		tags?: string[];
		dependsOn?: string[];
		aiProvider?: string;
		aiModel?: string;
		serverOverride?: string;
		workingDirectoryOverride?: string;
		autoStart?: boolean;
		autoPilot?: boolean;
		autoClose?: boolean;
		useWorktree?: boolean;
		useMemory?: boolean;
	}): Promise<OrchestratorTask> {
		const validColumns = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
		const column = params.column && validColumns.includes(params.column) ? params.column : 'backlog';
		// Map string priority to numeric
		const priorityMap: Record<string, number> = { low: 8, medium: 5, high: 3, critical: 1 };
		const priority = typeof params.priority === 'string' ? (priorityMap[params.priority] ?? 5) : (params.priority ?? 5);
		// If title is provided, use description as input (detailed body) and title as description (displayed name)
		const taskTitle = params.title || params.description;
		const taskBody = params.title ? params.description : undefined;
		const task: OrchestratorTask = {
			id: crypto.randomUUID?.() || `task-${Date.now()}`,
			description: taskTitle,
			input: taskBody,
			priority,
			targetRole: params.role,
			swimLaneId: params.lane,
			status: TaskStatus.PENDING,
			kanbanColumn: column as OrchestratorTask['kanbanColumn'],
			createdAt: Date.now(),
			tags: params.tags,
			dependsOn: params.dependsOn,
			aiProvider: params.aiProvider as any,
			aiModel: params.aiModel,
			serverOverride: params.serverOverride,
			workingDirectoryOverride: params.workingDirectoryOverride,
			autoStart: params.autoStart,
			autoPilot: params.autoPilot,
			autoClose: params.autoClose,
			useWorktree: params.useWorktree,
			useMemory: params.useMemory,
		};

		this.db.saveTask(task);

		// Submit to orchestrator
		this.orchestrator.submitTask(task);

		return task;
	}

	private async taskMove(params: { id: string; column?: string; lane?: string; status?: string }): Promise<OrchestratorTask> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}

		const oldColumn = task.kanbanColumn || 'backlog';
		const oldLane = task.swimLaneId;
		const oldStatus = task.status;

		// ── Lane move (pure reassignment, no side effects) ──────────────
		if (params.lane !== undefined && params.lane !== oldLane) {
			task.swimLaneId = params.lane || undefined;
		}

		// ── Column move (triggers side effects) ─────────────────────────
		if (params.column !== undefined && params.column !== oldColumn) {
			task.kanbanColumn = params.column as OrchestratorTask['kanbanColumn'];

			if (params.column === 'done') {
				task.status = TaskStatus.COMPLETED;
				task.completedAt = Date.now();

				// Clean up worktree if one was created
				if (task.worktreePath && this.tmuxServices) {
					const serverId = task.tmuxServerId || 'local';
					const service = this.tmuxServices.getService(serverId);
					if (service) {
						try {
							await service.execCommand(`git worktree remove ${JSON.stringify(task.worktreePath)} --force`);
						} catch { /* worktree may be gone */ }
					}
					task.worktreePath = undefined;
				}

				this.db.saveTask(task);

				// Trigger dependent tasks
				const allTasks = this.db.getAllTasks();
				for (const dep of allTasks) {
					if (!dep.dependsOn || !dep.dependsOn.includes(task.id)) { continue; }
					const allMet = dep.dependsOn.every(depId => {
						const d = this.db.getTask(depId);
						return d && d.status === TaskStatus.COMPLETED;
					});
					if (allMet && dep.autoStart && (dep.kanbanColumn === 'todo' || dep.kanbanColumn === 'backlog') && dep.swimLaneId) {
						dep.kanbanColumn = 'todo';
						this.db.saveTask(dep);
						try {
							await this.kanbanStartTask({ taskId: dep.id });
						} catch (err) {
							this.logger.warn('rpc', `[task.move] Failed to auto-start dependent ${dep.id}: ${err}`);
						}
					}
				}
			} else if (params.column === 'in_progress' && task.swimLaneId) {
				const lane = this.db.getSwimLane(task.swimLaneId);
				if (lane && resolveToggle(task, 'autoStart', lane)) {
					// Auto-start: delegate to kanbanStartTask (it sets status, tmux coords, etc.)
					try {
						await this.kanbanStartTask({ taskId: task.id });
						// kanbanStartTask already saved the task, re-read it
						const updated = this.db.getTask(task.id);
						if (updated) { Object.assign(task, updated); }
					} catch (err) {
						this.logger.warn('rpc', `[task.move] Auto-start failed for ${task.id}: ${err}`);
						// Still mark as in_progress even if auto-start fails
						task.status = TaskStatus.IN_PROGRESS;
						task.startedAt = task.startedAt || Date.now();
					}
				} else {
					task.status = TaskStatus.IN_PROGRESS;
					task.startedAt = task.startedAt || Date.now();
				}
			} else if ((params.column === 'todo' || params.column === 'backlog') &&
				(oldColumn === 'in_progress' || oldColumn === 'done')) {
				// Moving back — reset status and clear tmux refs
				task.status = TaskStatus.PENDING;
				task.tmuxSessionName = undefined;
				task.tmuxWindowIndex = undefined;
				task.tmuxPaneIndex = undefined;
				task.tmuxServerId = undefined;
			}
		}

		// ── Explicit status override ────────────────────────────────────
		if (params.status !== undefined) {
			task.status = params.status as TaskStatus;
		}

		this.db.saveTask(task);

		// ── Status history ──────────────────────────────────────────────
		if (params.column !== undefined && params.column !== oldColumn) {
			this.db.addStatusHistory({
				id: crypto.randomUUID?.() || `hist-${Date.now()}`,
				taskId: task.id,
				fromStatus: oldStatus,
				toStatus: task.status,
				fromColumn: oldColumn,
				toColumn: params.column,
				changedAt: Date.now(),
			});
		}

		// ── Emit events ─────────────────────────────────────────────────
		if (this.eventBus) {
			this.eventBus.emit('task.moved', {
				taskId: task.id,
				fromColumn: oldColumn,
				toColumn: task.kanbanColumn,
				fromLane: oldLane,
				toLane: task.swimLaneId,
			});
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		return task;
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
		const { id, title, ...updates } = params;
		const task = this.db.getTask(id);
		if (!task) {
			throw new Error(`Task not found: ${id}`);
		}
		// Handle title → description mapping (title is the display name, stored in description)
		if (title) {
			updates.description = title;
		}
		// Map string priority to numeric
		if (typeof updates.priority === 'string') {
			const priorityMap: Record<string, number> = { low: 8, medium: 5, high: 3, critical: 1 };
			updates.priority = priorityMap[updates.priority] ?? 5;
		}
		// Map column alias
		if (updates.column) {
			updates.kanbanColumn = updates.column;
			delete updates.column;
		}
		// Map lane alias
		if (updates.lane) {
			updates.swimLaneId = updates.lane;
			delete updates.lane;
		}
		// Map role alias
		if (updates.role) {
			updates.targetRole = updates.role;
			delete updates.role;
		}
		// Whitelist allowed fields to prevent prototype pollution
		const allowedFields = [
			'description', 'input', 'priority', 'status', 'kanbanColumn',
			'assignedAgentId', 'swimLaneId', 'targetRole',
			'tags', 'dependsOn', 'aiProvider', 'aiModel',
			'serverOverride', 'workingDirectoryOverride',
			'autoStart', 'autoPilot', 'autoClose', 'useWorktree', 'useMemory',
		];
		const safeUpdates: Record<string, any> = {};
		for (const field of allowedFields) {
			if (field in updates) {
				safeUpdates[field] = updates[field];
			}
		}
		Object.assign(task, safeUpdates);
		this.db.saveTask(task);

		// Emit events so WS clients can sync
		if (this.eventBus) {
			this.eventBus.emit('task.updated', { taskId: task.id });
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		return task;
	}

	private async taskSave(params: OrchestratorTask): Promise<OrchestratorTask> {
		if (!params.id) {
			throw new Error('task.save requires an id');
		}
		this.db.saveTask(params);
		// Also submit to in-memory orchestrator so getTaskQueue reflects the change
		const existing = this.orchestrator.getTask(params.id);
		if (!existing) {
			this.orchestrator.submitTask(params);
		}
		return params;
	}

	// ─── AI Config Handlers ────────────────────────────────────────────────

	private async aiResolveConfig(params: { laneId?: string; taskId?: string }): Promise<{
		provider: string;
		model: string | undefined;
		launchCommand: string;
	}> {
		let laneProvider: AIProvider | undefined;
		let laneModel: string | undefined;
		let taskProvider: AIProvider | undefined;
		let taskModel: string | undefined;

		if (params.laneId) {
			const lane = this.db.getSwimLane(params.laneId);
			if (lane) {
				laneProvider = lane.aiProvider as AIProvider | undefined;
				laneModel = lane.aiModel;
			}
		}
		if (params.taskId) {
			const task = this.db.getTask(params.taskId);
			if (task) {
				taskProvider = task.aiProvider as AIProvider | undefined;
				taskModel = task.aiModel;
			}
		}

		const provider = this.aiManager.resolveProvider(taskProvider, laneProvider);
		const model = this.aiManager.resolveModel(taskModel, laneModel);
		const launchCommand = this.aiManager.getInteractiveLaunchCommand(provider, model);

		return { provider, model, launchCommand };
	}

	private async aiGetSpawnConfig(params: { provider?: string; model?: string }): Promise<{
		command: string;
		args: string[];
		env: Record<string, string>;
		cwd: string;
		shell: boolean;
	}> {
		const provider = (params.provider || this.aiManager.getDefaultProvider()) as AIProvider;
		const spawnConfig = this.aiManager.getSpawnConfig(provider, params.model);
		return { ...spawnConfig, cwd: spawnConfig.cwd || process.cwd() };
	}

	private async aiSummarize(params: { text: string; laneId?: string }): Promise<string> {
		const lane = params.laneId ? this.db.getSwimLane(params.laneId) : undefined;
		const provider = this.aiManager.resolveProvider(undefined, lane?.aiProvider as AIProvider | undefined);
		const spawnConfig = this.aiManager.getSpawnConfig(provider);
		const cmdStr = [spawnConfig.command, ...spawnConfig.args].join(' ');

		return new Promise<string>((resolve) => {
			const proc = cp.exec(cmdStr, {
				env: { ...process.env, ...spawnConfig.env },
				cwd: spawnConfig.cwd || process.cwd(),
				maxBuffer: 10 * 1024 * 1024,
				timeout: 20000
			}, (error, stdout) => {
				resolve(error ? '' : stdout.trim());
			});
			proc.stdin!.on('error', () => {});
			process.nextTick(() => {
				if (proc.stdin && proc.stdin.writable && !proc.killed) {
					proc.stdin.write(params.text);
					proc.stdin.end();
				}
			});
		});
	}

	// ─── Task Output Handler ────────────────────────────────────────────────

	private async taskGetOutput(params: { id: string; lines?: number }): Promise<string> {
		const task = this.db.getTask(params.id);
		if (!task) {
			throw new Error(`Task not found: ${params.id}`);
		}
		if (!this.tmuxServices || !task.tmuxSessionName || !task.tmuxWindowIndex || !task.tmuxPaneIndex) {
			throw new Error('Task has no active tmux session');
		}
		const serverId = task.tmuxServerId || 'local';
		const service = this.tmuxServices.getService(serverId);
		if (!service) {
			throw new Error(`Runtime not found: ${serverId}`);
		}
		return service.capturePaneContent(
			task.tmuxSessionName,
			task.tmuxWindowIndex,
			task.tmuxPaneIndex,
			params.lines || 50,
		);
	}

	// ─── Team Handlers ───────────────────────────────────────────────────────

	private async teamList(_params: {}): Promise<AgentTeam[]> {
		return this.db.getAllTeams();
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

	private async teamQuickCode(_params: { workdir: string; runtime?: string }): Promise<AgentTeam> {
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

	private async pipelineList(_params: {}): Promise<Pipeline[]> {
		return this.db.getAllPipelines();
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

	private async pipelineGetActive(_params: {}): Promise<PipelineRun[]> {
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

	private async kanbanListLanes(_params: {}): Promise<KanbanSwimLane[]> {
		return this.db.getAllSwimLanes();
	}

	private async kanbanCreateLane(params: {
		name: string;
		workdir?: string;
		provider?: AIProvider;
		runtime?: string;
		defaultToggles?: SwimLaneDefaultToggles;
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
			defaultToggles: params.defaultToggles,
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
		// Whitelist allowed fields to prevent prototype pollution
		const allowedFields = [
			'name', 'workingDirectory', 'sessionName', 'serverId',
			'aiProvider', 'aiModel', 'contextInstructions',
			'defaultToggles', 'memoryPath',
		];
		const safeUpdates: Record<string, any> = {};
		for (const field of allowedFields) {
			if (field in updates) {
				safeUpdates[field] = updates[field];
			}
		}
		Object.assign(lane, safeUpdates);
		this.db.saveSwimLane(lane);
		return lane;
	}

	private async kanbanDeleteLane(params: { id: string }): Promise<void> {
		this.db.deleteSwimLane(params.id);
	}

	private async kanbanSaveLane(params: KanbanSwimLane): Promise<KanbanSwimLane> {
		if (!params.id) {
			throw new Error('kanban.saveLane requires an id');
		}
		this.db.saveSwimLane(params);
		return params;
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

	private async kanbanStartTask(params: {
		id?: string;
		taskId?: string;
		additionalInstructions?: string;
		askForContext?: boolean;
	}): Promise<any> {
		const taskId = params.taskId || params.id;
		if (!taskId) {
			throw new Error('kanban.startTask requires id or taskId');
		}
		const task = this.db.getTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		// If no TmuxServiceManager, fall back to status-only change
		if (!this.tmuxServices) {
			task.status = TaskStatus.IN_PROGRESS;
			task.kanbanColumn = 'in_progress';
			task.startedAt = Date.now();
			this.db.saveTask(task);
			return { taskId: task.id };
		}

		// Require a swim lane for full spawn
		if (!task.swimLaneId) {
			throw new Error('Task must be assigned to a swim lane before starting. Use task.update to set a lane.');
		}

		const lane = this.db.getSwimLane(task.swimLaneId);
		if (!lane) {
			throw new Error(`Swim lane not found: ${task.swimLaneId}`);
		}

		// Resolve effective server and working directory
		const effectiveServerId = task.serverOverride || lane.serverId || 'local';
		const effectiveWorkingDir = task.workingDirectoryOverride || lane.workingDirectory;

		const service = this.tmuxServices.getService(effectiveServerId);
		if (!service) {
			throw new Error(`Runtime not found: ${effectiveServerId}`);
		}

		// Ensure the lane's tmux session exists
		const ready = await ensureLaneSession(service, lane);
		if (!ready) {
			throw new Error(`Failed to create tmux session for lane "${lane.name}"`);
		}
		this.db.saveSwimLane(lane);

		// Create a new tmux window for this task
		const windowName = buildTaskWindowName(task);
		await service.newWindow(lane.sessionName, windowName);
		await cleanupInitWindow(service, lane.sessionName);

		// Find the window we just created
		const sessions = await service.getTmuxTreeFresh();
		const session = sessions.find(s => s.name === lane.sessionName);
		const win = session?.windows.find(w => w.name === windowName);
		const winIndex = win?.index || '0';
		const paneIndex = win?.panes[0]?.index || '0';

		// Set up worktree if enabled
		if (resolveToggle(task, 'useWorktree', lane) && effectiveWorkingDir) {
			const shortId = task.id.slice(-8);
			const branchName = `task-${shortId}`;
			try {
				const resolvedDir = (await service.execCommand(`cd ${effectiveWorkingDir} && pwd`)).trim();
				const parentDir = resolvedDir.substring(0, resolvedDir.lastIndexOf('/'));
				const worktreeDir = `${parentDir}/.worktrees`;
				const worktreePath = `${worktreeDir}/${branchName}`;
				await service.execCommand(`mkdir -p ${JSON.stringify(worktreeDir)}`);
				if (task.worktreePath) {
					try {
						await service.execCommand(`git -C ${JSON.stringify(resolvedDir)} worktree remove ${JSON.stringify(task.worktreePath)} --force`);
					} catch { /* may already be gone */ }
					task.worktreePath = undefined;
				}
				try {
					await service.execCommand(`git -C ${JSON.stringify(resolvedDir)} branch -D ${branchName}`);
				} catch { /* branch may not exist */ }
				await service.execCommand(`git -C ${JSON.stringify(resolvedDir)} worktree add ${JSON.stringify(worktreePath)} -b ${branchName}`);
				task.worktreePath = worktreePath;
				await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${worktreePath}`);
			} catch (err) {
				this.logger.warn('rpc', `[kanban.startTask] Worktree setup failed: ${err}`);
				await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${effectiveWorkingDir}`);
			}
		} else if (effectiveWorkingDir) {
			await service.sendKeys(lane.sessionName, winIndex, paneIndex, `cd ${effectiveWorkingDir}`);
		}

		// Build the prompt — handle subtasks (TaskBox) if present
		let prompt: string;
		if (task.subtaskIds && task.subtaskIds.length > 0) {
			const subtasks = task.subtaskIds
				.map(id => this.db.getTask(id))
				.filter((s): s is OrchestratorTask => !!s);
			prompt = buildTaskBoxPrompt(task, subtasks, lane);
			// Mark each subtask as in_progress with tmux coordinates
			for (const sub of subtasks) {
				sub.kanbanColumn = 'in_progress';
				sub.status = TaskStatus.IN_PROGRESS;
				sub.startedAt = Date.now();
				sub.tmuxSessionName = lane.sessionName;
				sub.tmuxWindowIndex = winIndex;
				sub.tmuxPaneIndex = paneIndex;
				sub.tmuxServerId = effectiveServerId;
				this.db.saveTask(sub);
			}
		} else {
			prompt = buildSingleTaskPrompt(task, lane);
		}

		// Build persona/guild context if the task is assigned to an agent
		let personaContext: string | undefined;
		let guildContext: string | undefined;
		if (task.assignedAgentId) {
			const agent = this.db.getAgent(task.assignedAgentId);
			if (agent?.persona) {
				personaContext = buildPersonaContext(agent.persona);
			}
			if (agent) {
				const guilds = this.db.getAllGuilds();
				const agentGuilds = guilds.filter(g => g.memberIds.includes(agent.id));
				if (agentGuilds.length > 0) {
					const guildParts = agentGuilds.map(g => {
						let part = `## Guild: ${g.name}`;
						if (g.expertiseArea) { part += `\n${g.expertiseArea}`; }
						if (g.knowledgeBase.length > 0) {
							part += '\nShared knowledge:';
							for (const k of g.knowledgeBase.slice(-3)) {
								part += `\n- ${k.summary.slice(0, 200)}`;
							}
						}
						return part;
					});
					guildContext = guildParts.join('\n\n');
				}
			}
		}

		// Fall back to role persona if no agent-level persona
		if (!personaContext && task.targetRole) {
			const customRoles = this.db.getAllCustomRoles();
			personaContext = buildRolePersonaContext(task.targetRole, customRoles);
		}

		// Build shared tail options
		const autoClose = resolveToggle(task, 'autoClose', lane);
		const signalId = task.id.slice(-8);
		const tailOptions: Parameters<typeof appendPromptTail>[1] = {
			autoClose,
			signalId,
			progressReporting: true,
			personaContext,
			guildContext,
			additionalInstructions: params.additionalInstructions,
			askForContext: params.askForContext,
		};

		// Build memory context if enabled
		if (resolveToggle(task, 'useMemory', lane) && lane.memoryFileId) {
			try {
				await ensureMemoryDir(service, lane);
				const memoryContent = await readMemoryFile(service, lane);
				const memoryFilePath = getMemoryFilePath(lane)!;
				tailOptions.memoryLoadContext = buildMemoryLoadPrompt(memoryContent, memoryFilePath);
				tailOptions.memorySaveContext = buildMemorySavePrompt(memoryFilePath);
			} catch (err) {
				this.logger.warn('rpc', `[kanban.startTask] Memory load failed: ${err}`);
			}
		}
		prompt = appendPromptTail(prompt, tailOptions);

		// Resolve AI provider and model
		const resolvedProvider = this.aiManager.resolveProvider(task.aiProvider as AIProvider | undefined, lane.aiProvider as AIProvider | undefined);
		const resolvedModel = this.aiManager.resolveModel(task.aiModel, lane.aiModel);
		const isAutoPilot = resolveToggle(task, 'autoPilot', lane);
		const launchCmd = this.aiManager.getInteractiveLaunchCommand(resolvedProvider, resolvedModel, isAutoPilot);

		// Launch: send CLI command, wait, paste prompt, press Enter
		const launchDelay = 3000;
		await service.sendKeys(lane.sessionName, winIndex, paneIndex, launchCmd);
		await new Promise(resolve => setTimeout(resolve, launchDelay));
		await service.pasteText(lane.sessionName, winIndex, paneIndex, prompt);
		await new Promise(resolve => setTimeout(resolve, 500));
		await service.sendRawKeys(lane.sessionName, winIndex, paneIndex, 'Enter');

		// Update task with tmux coordinates
		task.tmuxSessionName = lane.sessionName;
		task.tmuxWindowIndex = winIndex;
		task.tmuxPaneIndex = paneIndex;
		task.tmuxServerId = effectiveServerId;
		task.kanbanColumn = 'in_progress';
		task.status = TaskStatus.IN_PROGRESS;
		task.startedAt = Date.now();
		this.db.saveTask(task);

		// Emit events
		if (this.eventBus) {
			this.eventBus.emit('task.started', { taskId: task.id, tmuxSession: lane.sessionName, windowIndex: winIndex });
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		this.logger.info('rpc', `[kanban.startTask] Task ${task.id} started in ${lane.sessionName}:${winIndex}`);

		return {
			taskId: task.id,
			tmuxSession: lane.sessionName,
			windowIndex: winIndex,
			paneIndex,
			serverId: effectiveServerId,
		};
	}

	private async kanbanStopTask(params: { id?: string; taskId?: string }): Promise<void> {
		const taskId = params.taskId || params.id;
		if (!taskId) {
			throw new Error('kanban.stopTask requires id or taskId');
		}
		const task = this.db.getTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		// Kill tmux window if running
		if (this.tmuxServices && task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
			const service = this.tmuxServices.getService(task.tmuxServerId);
			if (service) {
				try {
					await service.killWindow(task.tmuxSessionName, task.tmuxWindowIndex);
				} catch (err) {
					this.logger.warn('rpc', `[kanban.stopTask] Failed to kill window: ${err}`);
				}

				// Clean up worktree if applicable
				if (task.worktreePath) {
					try {
						await service.execCommand(`git worktree remove ${JSON.stringify(task.worktreePath)} --force`);
					} catch { /* worktree may be gone */ }
					task.worktreePath = undefined;
				}
			}
		}

		// Clear tmux references
		task.tmuxSessionName = undefined;
		task.tmuxWindowIndex = undefined;
		task.tmuxPaneIndex = undefined;
		task.tmuxServerId = undefined;

		task.status = TaskStatus.COMPLETED;
		task.kanbanColumn = 'done';
		task.completedAt = Date.now();
		this.db.saveTask(task);

		// Emit events
		if (this.eventBus) {
			this.eventBus.emit('task.completed', { taskId: task.id });
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		this.logger.info('rpc', `[kanban.stopTask] Task ${task.id} stopped`);
	}

	private async kanbanRestartTask(params: { id?: string; taskId?: string; additionalInstructions?: string; askForContext?: boolean }): Promise<any> {
		const taskId = params.taskId || params.id;
		if (!taskId) {
			throw new Error('kanban.restartTask requires id or taskId');
		}

		// Stop the task first
		await this.kanbanStopTask({ taskId });

		// Reset task state so it can be started again
		const task = this.db.getTask(taskId);
		if (!task) {
			throw new Error(`Task not found after stop: ${taskId}`);
		}
		task.status = TaskStatus.PENDING;
		task.kanbanColumn = 'backlog';
		task.completedAt = undefined;
		task.startedAt = undefined;
		this.db.saveTask(task);

		// Start it again
		return this.kanbanStartTask({
			taskId,
			additionalInstructions: params.additionalInstructions,
			askForContext: params.askForContext,
		});
	}

	private async kanbanStartBundle(params: { taskIds: string[]; additionalInstructions?: string; askForContext?: boolean }): Promise<any[]> {
		if (!params.taskIds || params.taskIds.length === 0) {
			throw new Error('kanban.startBundle requires taskIds array');
		}

		const results: any[] = [];
		for (const taskId of params.taskIds) {
			try {
				const result = await this.kanbanStartTask({
					taskId,
					additionalInstructions: params.additionalInstructions,
					askForContext: params.askForContext,
				});
				results.push(result);
			} catch (err) {
				this.logger.warn('rpc', `[kanban.startBundle] Failed to start task ${taskId}: ${err}`);
				results.push({ taskId, error: String(err) });
			}
		}

		return results;
	}

	private async kanbanCloseTaskWindow(params: { id?: string; taskId?: string }): Promise<void> {
		const taskId = params.taskId || params.id;
		if (!taskId) {
			throw new Error('kanban.closeTaskWindow requires id or taskId');
		}
		const task = this.db.getTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		if (this.tmuxServices && task.tmuxSessionName && task.tmuxWindowIndex && task.tmuxServerId) {
			const service = this.tmuxServices.getService(task.tmuxServerId);
			if (service) {
				try {
					await service.killWindow(task.tmuxSessionName, task.tmuxWindowIndex);
				} catch (err) {
					this.logger.warn('rpc', `[kanban.closeTaskWindow] Failed to kill window: ${err}`);
				}
			}
		}

		// Clear tmux references
		task.tmuxSessionName = undefined;
		task.tmuxWindowIndex = undefined;
		task.tmuxPaneIndex = undefined;
		task.tmuxServerId = undefined;
		this.db.saveTask(task);

		if (this.eventBus) {
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		this.logger.info('rpc', `[kanban.closeTaskWindow] Window closed for task ${task.id}`);
	}

	private async kanbanCleanupWorktree(params: { id?: string; taskId?: string }): Promise<void> {
		const taskId = params.taskId || params.id;
		if (!taskId) {
			throw new Error('kanban.cleanupWorktree requires id or taskId');
		}
		const task = this.db.getTask(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		if (!task.worktreePath) {
			return; // No worktree to clean up
		}

		if (this.tmuxServices && task.tmuxServerId) {
			const service = this.tmuxServices.getService(task.tmuxServerId);
			if (service) {
				try {
					await service.execCommand(`git worktree remove ${JSON.stringify(task.worktreePath)} --force`);
				} catch (err) {
					this.logger.warn('rpc', `[kanban.cleanupWorktree] Failed to remove worktree: ${err}`);
				}
			}
		}

		task.worktreePath = undefined;
		this.db.saveTask(task);

		if (this.eventBus) {
			this.eventBus.emit('db.changed', { method: 'saveTask' });
		}

		this.logger.info('rpc', `[kanban.cleanupWorktree] Worktree cleaned for task ${task.id}`);
	}

	// ─── Runtime Handlers ────────────────────────────────────────────────────

	private async runtimeList(_params: {}): Promise<any[]> {
		return this.config.runtimes;
	}

	private async runtimeAdd(params: { id: string; type: string; [key: string]: any }): Promise<void> {
		// This would persist to config file
		this.config.runtimes.push(params as any);
		// Also register a TmuxService so the runtime is immediately usable
		if (this.tmuxServices) {
			this.tmuxServices.registerService(params as RuntimeConfig);
		}
	}

	private async runtimeRegister(params: {
		servers: Array<{
			id: string;
			type: 'local-tmux' | 'ssh';
			label?: string;
			host?: string;
			port?: number;
			user?: string;
			configFile?: string;
		}>;
	}): Promise<{ registered: string[] }> {
		const registered: string[] = [];
		for (const server of params.servers) {
			if (!server.id || !server.type) { continue; }
			// Add to config.runtimes if not already present
			if (!this.config.runtimes.find(r => r.id === server.id)) {
				this.config.runtimes.push(server as RuntimeConfig);
			}
			// Dynamically create TmuxService
			if (this.tmuxServices) {
				this.tmuxServices.registerService(server as RuntimeConfig);
				registered.push(server.id);
			}
		}
		return { registered };
	}

	private async runtimeRemove(params: { id: string }): Promise<void> {
		this.config.runtimes = this.config.runtimes.filter(r => r.id !== params.id);
	}

	private async runtimePing(params: { id: string }): Promise<{ ok: boolean; latency?: number }> {
		const runtime = this.config.runtimes.find(r => r.id === params.id);
		if (!runtime) {
			throw new Error(`Runtime not found: ${params.id}`);
		}

		const health = await this.healthChecker.getHealthReport(this.db, [runtime]);
		const component = health.components.find(c => c.name === `runtime:${params.id}`);

		return {
			ok: component?.status === 'healthy',
			latency: component?.latency,
		};
	}

	// ─── Daemon Handlers ─────────────────────────────────────────────────────

	private async daemonHealth(_params: {}): Promise<any> {
		return this.healthChecker.getHealthReport(this.db, this.config.runtimes);
	}

	private async daemonConfig(_params: {}): Promise<DaemonConfig> {
		return this.config;
	}

	private async daemonReload(_params: {}): Promise<void> {
		// Reload config would be handled by supervisor via SIGHUP
		throw new Error('daemon.reload not yet implemented');
	}

	private async daemonStats(_params: {}): Promise<any> {
		const agents = this.orchestrator.getAllAgents();
		const tasks = this.db.getAllTasks();

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

	private async daemonShutdown(_params: {}): Promise<void> {
		// Trigger graceful shutdown
		process.emit('SIGTERM' as any);
	}

	// ─── Built-in Role Definitions ──────────────────────────────────────────

	private static readonly BUILT_IN_ROLES = [
		{ name: 'coder', description: 'Writes and modifies code' },
		{ name: 'reviewer', description: 'Reviews code for quality and correctness' },
		{ name: 'tester', description: 'Writes and runs tests' },
		{ name: 'devops', description: 'Infrastructure, CI/CD, and deployment' },
		{ name: 'researcher', description: 'Investigates technologies, APIs, and solutions' },
	];

	// ─── Role Handlers ──────────────────────────────────────────────────────

	private async roleList(_params: {}): Promise<any[]> {
		const builtIn = RpcRouter.BUILT_IN_ROLES.map(r => ({
			name: r.name,
			description: r.description,
			builtIn: true,
		}));
		const custom = this.db.getAllCustomRoles().map(r => ({
			id: r.id,
			name: r.name,
			description: r.description || '',
			systemPrompt: r.systemPrompt || undefined,
			builtIn: false,
		}));
		return [...builtIn, ...custom];
	}

	private async roleCreate(params: {
		name: string;
		description?: string;
		systemPrompt?: string;
	}): Promise<CustomRole> {
		if (!params.name) {
			throw new Error('role.create requires a name');
		}
		// Check for conflict with built-in roles
		const lower = params.name.toLowerCase();
		if (RpcRouter.BUILT_IN_ROLES.some(r => r.name === lower)) {
			throw new Error(`Cannot create custom role "${params.name}": conflicts with built-in role`);
		}
		const role: CustomRole = {
			id: crypto.randomUUID?.() || `role-${Date.now()}`,
			name: lower,
			description: params.description,
			systemPrompt: params.systemPrompt,
			createdAt: Date.now(),
		};
		this.db.saveCustomRole(role);
		return role;
	}

	private async roleUpdate(params: {
		id: string;
		name?: string;
		description?: string;
		systemPrompt?: string;
	}): Promise<CustomRole> {
		if (!params.id) {
			throw new Error('role.update requires an id');
		}
		const role = this.db.getCustomRole(params.id);
		if (!role) {
			throw new Error(`Custom role not found: ${params.id}`);
		}
		if (params.name !== undefined) {
			const lower = params.name.toLowerCase();
			if (RpcRouter.BUILT_IN_ROLES.some(r => r.name === lower)) {
				throw new Error(`Cannot rename to "${params.name}": conflicts with built-in role`);
			}
			role.name = lower;
		}
		if (params.description !== undefined) { role.description = params.description; }
		if (params.systemPrompt !== undefined) { role.systemPrompt = params.systemPrompt; }
		this.db.saveCustomRole(role);
		return role;
	}

	private async roleDelete(params: { id: string }): Promise<void> {
		if (!params.id) {
			throw new Error('role.delete requires an id');
		}
		const role = this.db.getCustomRole(params.id);
		if (!role) {
			throw new Error(`Custom role not found: ${params.id}`);
		}
		this.db.deleteCustomRole(params.id);
	}

	// ─── Fanout Handlers ─────────────────────────────────────────────────────

	private async fanoutRun(_params: {
		prompt: string;
		count?: number;
		provider?: AIProvider;
		runtime?: string;
	}): Promise<string[]> {
		// Spawn N agents with the same prompt and collect results
		throw new Error('fanout.run not yet implemented');
	}

	// ─── Tmux Handlers ──────────────────────────────────────────────────────

	private async tmuxGetTree(params: { serverId?: string; fresh?: boolean }): Promise<TmuxSession[]> {
		if (!this.tmuxServices) {
			throw new Error('TmuxServiceManager not available');
		}
		const serverId = params.serverId || 'local';
		const service = this.tmuxServices.getService(serverId);
		if (!service) {
			throw new Error(`Server not found: ${serverId}`);
		}
		if (params.fresh) {
			return service.getTmuxTreeFresh();
		}
		return service.getTmuxTree();
	}

	// ─── Generic DB Proxy Handler ───────────────────────────────────────────

	private static readonly DB_WHITELIST = new Set([
		// Swim lanes
		'saveSwimLane', 'deleteSwimLane', 'getAllSwimLanes', 'getSwimLane',
		// Tasks
		'saveTask', 'deleteTask', 'getAllTasks', 'getTask', 'getTasksBySwimLane', 'getSubtasks',
		// Favourite folders
		'saveFavouriteFolder', 'deleteFavouriteFolder', 'getAllFavouriteFolders',
		// Agents
		'saveAgent', 'deleteAgent', 'getAllAgents', 'getAgent',
		// Teams
		'saveTeam', 'deleteTeam', 'getAllTeams', 'getTeam',
		// Pipelines
		'savePipeline', 'deletePipeline', 'getAllPipelines', 'getPipeline',
		// Pipeline runs
		'savePipelineRun', 'deletePipelineRun', 'getAllPipelineRuns', 'getPipelineRun',
		// Org units
		'saveOrgUnit', 'deleteOrgUnit', 'getAllOrgUnits', 'getOrgUnit',
		// Guilds
		'saveGuild', 'deleteGuild', 'getAllGuilds', 'getGuild', 'addGuildKnowledge',
		// Agent messages
		'saveAgentMessage', 'markMessageRead', 'getAgentMessages', 'getAllAgentMessages',
		// Agent profile stats
		'getAgentProfileStats', 'getAllAgentProfileStats',
		// Status history
		'addStatusHistory', 'getStatusHistory',
		// Comments
		'addComment', 'deleteComment', 'getComments',
		// Tags
		'saveTags', 'getTags',
		// Backend mappings
		'saveBackendMapping', 'deleteBackendMapping', 'getBackendMapping',
		'getAllMappingsForBackend', 'getAllMappingsForTask',
		// Sync errors
		'logSyncError', 'getSyncErrors', 'clearSyncError',
		// Backend configs
		'saveBackendConfig', 'deleteBackendConfig', 'getBackendConfig',
		'getAllBackendConfigs', 'updateBackendConfig',
		// Custom roles
		'saveCustomRole', 'deleteCustomRole', 'getCustomRole', 'getAllCustomRoles',
	]);

	private static readonly DB_WRITE_PREFIXES = ['save', 'delete', 'add', 'mark', 'log', 'clear', 'update'];

	private async dbCall(params: { method: string; args: any[] }): Promise<any> {
		if (!params.method || typeof params.method !== 'string') {
			throw new Error('db.call requires a method name');
		}
		if (!RpcRouter.DB_WHITELIST.has(params.method)) {
			throw new Error(`Method not allowed: ${params.method}`);
		}
		const fn = (this.db as any)[params.method];
		if (typeof fn !== 'function') {
			throw new Error(`Unknown method: ${params.method}`);
		}
		const result = fn.apply(this.db, params.args || []);
		// Emit db.changed event for write operations so WS clients can sync
		if (this.eventBus && RpcRouter.DB_WRITE_PREFIXES.some(p => params.method.startsWith(p))) {
			this.eventBus.emit('db.changed', { method: params.method });
		}
		return result;
	}

	/** Return all data in one call for efficient client cache refresh. */
	private async dbSnapshot(_params: {}): Promise<any> {
		return {
			tasks: this.db.getAllTasks(),
			swimLanes: this.db.getAllSwimLanes(),
			agents: this.db.getAllAgents(),
			teams: this.db.getAllTeams(),
			pipelines: this.db.getAllPipelines(),
			pipelineRuns: this.db.getAllPipelineRuns(),
			favouriteFolders: this.db.getAllFavouriteFolders(),
			orgUnits: this.db.getAllOrgUnits(),
			guilds: this.db.getAllGuilds(),
			agentMessages: this.db.getAllAgentMessages(100),
			agentProfileStats: this.db.getAllAgentProfileStats(),
			customRoles: this.db.getAllCustomRoles(),
		};
	}

	// ─── Backend Handlers ────────────────────────────────────────────────────

	private async backendList(_params: {}): Promise<any[]> {
		if (!this.backendRegistry) {
			return [];
		}
		return this.backendRegistry.list();
	}

	private async backendAdd(params: {
		name: string;
		type: string;
		config: any;
	}): Promise<{ success: boolean; name: string; type: string }> {
		if (!this.backendRegistry) {
			throw new Error('Backend system not initialized');
		}

		const { name, type, config } = params;

		// Validate type
		const validTypes = ['example', 'jira', 'github', 'linear'];
		if (!validTypes.includes(type)) {
			throw new Error(`Unknown backend type: ${type}. Valid types: ${validTypes.join(', ')}`);
		}

		this.logger.info('rpc', `Adding backend: ${name} (${type})`);

		// Save to database
		this.db.saveBackendConfig({
			backend_name: name,
			backend_type: type,
			config_json: JSON.stringify(config),
			enabled: true,
			created_at: Date.now(),
			updated_at: Date.now(),
		});

		// Create and initialize backend
		try {
			const backend = await this.backendRegistry.createBackend(type, {
				name,
				...config,
			});
			await backend.initialize(config);
			this.backendRegistry.register(name, backend);

			this.logger.info('rpc', `Backend added successfully: ${name}`);

			return { success: true, name, type };
		} catch (err: any) {
			this.logger.error('rpc', `Failed to initialize backend: ${name}`, {
				error: String(err),
			});
			// Delete from database if initialization failed
			this.db.deleteBackendConfig(name);
			throw new Error(`Failed to initialize backend: ${err.message}`);
		}
	}

	private async backendRemove(params: { name: string }): Promise<{ success: boolean }> {
		if (!this.backendRegistry) {
			throw new Error('Backend system not initialized');
		}

		const { name } = params;

		this.logger.info('rpc', `Removing backend: ${name}`);

		// Remove from registry
		this.backendRegistry.remove(name);

		// Remove from database
		this.db.deleteBackendConfig(name);

		return { success: true };
	}

	private async backendEnable(params: { name: string }): Promise<{ success: boolean }> {
		const { name } = params;

		this.logger.info('rpc', `Enabling backend: ${name}`);

		this.db.updateBackendConfig(name, { enabled: true });

		return { success: true };
	}

	private async backendDisable(params: { name: string }): Promise<{ success: boolean }> {
		const { name } = params;

		this.logger.info('rpc', `Disabling backend: ${name}`);

		this.db.updateBackendConfig(name, { enabled: false });

		return { success: true };
	}

	private async backendSync(params: { backend?: string }): Promise<SyncReport | SyncReport[]> {
		if (!this.syncService) {
			throw new Error('Sync service not initialized');
		}

		this.logger.info('rpc', `Triggering sync for: ${params.backend || 'all backends'}`);

		if (params.backend) {
			await this.syncService.syncBackend(params.backend);
			// Return a basic sync report (TaskSyncService doesn't return SyncReport yet in Phase 1)
			return {
				backend: params.backend,
				pushed: 0,
				pulled: 0,
				conflicts: 0,
				errors: 0,
				duration: 0,
			};
		} else {
			await this.syncService.syncAll();
			// Return empty array for now (Phase 1 - no detailed reports yet)
			const backends = this.backendRegistry?.list() || [];
			return backends.map(b => ({
				backend: b.name,
				pushed: 0,
				pulled: 0,
				conflicts: 0,
				errors: 0,
				duration: 0,
			}));
		}
	}

	private async backendStatus(params: { name: string }): Promise<BackendStatus> {
		if (!this.backendRegistry) {
			throw new Error('Backend system not initialized');
		}

		const backend = this.backendRegistry.get(params.name);
		if (!backend) {
			throw new Error(`Backend not found: ${params.name}`);
		}

		return backend.getStatus();
	}

	private async backendRetryErrors(params: { backend?: string }): Promise<{
		errors: number;
		message: string;
	}> {
		const errors = this.db.getSyncErrors(params.backend);

		this.logger.info('rpc', `Retry errors requested for: ${params.backend || 'all backends'}`, {
			errorCount: errors.length,
		});

		// TODO: Implement retry logic in Phase 2
		return {
			errors: errors.length,
			message: 'Retry logic not yet implemented (Phase 1)',
		};
	}
}

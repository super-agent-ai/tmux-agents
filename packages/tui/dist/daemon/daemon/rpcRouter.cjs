"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcRouter = exports.RPC_ERRORS = void 0;
// Standard JSON-RPC error codes
exports.RPC_ERRORS = {
    PARSE_ERROR: { code: -32700, message: 'Parse error' },
    INVALID_REQUEST: { code: -32600, message: 'Invalid request' },
    METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
    INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
    INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
    SERVER_ERROR: { code: -32000, message: 'Server error' }
};
// ─── RPC Router ──────────────────────────────────────────────────────────────
class RpcRouter {
    constructor(context, logger) {
        this.context = context;
        this.logger = logger;
        this.handlers = new Map();
        this.registerHandlers();
    }
    // Register all RPC method handlers
    registerHandlers() {
        // Agent methods
        this.handlers.set('agent.list', this.agentList.bind(this));
        this.handlers.set('agent.get', this.agentGet.bind(this));
        this.handlers.set('agent.spawn', this.agentSpawn.bind(this));
        this.handlers.set('agent.kill', this.agentKill.bind(this));
        this.handlers.set('agent.sendPrompt', this.agentSendPrompt.bind(this));
        this.handlers.set('agent.getOutput', this.agentGetOutput.bind(this));
        this.handlers.set('agent.getStatus', this.agentGetStatus.bind(this));
        this.handlers.set('agent.getAttachCommand', this.agentGetAttachCommand.bind(this));
        // Task methods
        this.handlers.set('task.list', this.taskList.bind(this));
        this.handlers.set('task.get', this.taskGet.bind(this));
        this.handlers.set('task.submit', this.taskSubmit.bind(this));
        this.handlers.set('task.move', this.taskMove.bind(this));
        this.handlers.set('task.cancel', this.taskCancel.bind(this));
        this.handlers.set('task.delete', this.taskDelete.bind(this));
        this.handlers.set('task.update', this.taskUpdate.bind(this));
        // Team methods
        this.handlers.set('team.list', this.teamList.bind(this));
        this.handlers.set('team.create', this.teamCreate.bind(this));
        this.handlers.set('team.delete', this.teamDelete.bind(this));
        this.handlers.set('team.addAgent', this.teamAddAgent.bind(this));
        this.handlers.set('team.removeAgent', this.teamRemoveAgent.bind(this));
        this.handlers.set('team.quickCode', this.teamQuickCode.bind(this));
        this.handlers.set('team.quickResearch', this.teamQuickResearch.bind(this));
        // Pipeline methods
        this.handlers.set('pipeline.list', this.pipelineList.bind(this));
        this.handlers.set('pipeline.create', this.pipelineCreate.bind(this));
        this.handlers.set('pipeline.run', this.pipelineRun.bind(this));
        this.handlers.set('pipeline.getStatus', this.pipelineGetStatus.bind(this));
        this.handlers.set('pipeline.getActive', this.pipelineGetActive.bind(this));
        this.handlers.set('pipeline.pause', this.pipelinePause.bind(this));
        this.handlers.set('pipeline.resume', this.pipelineResume.bind(this));
        this.handlers.set('pipeline.cancel', this.pipelineCancel.bind(this));
        // Kanban methods
        this.handlers.set('kanban.listLanes', this.kanbanListLanes.bind(this));
        this.handlers.set('kanban.createLane', this.kanbanCreateLane.bind(this));
        this.handlers.set('kanban.editLane', this.kanbanEditLane.bind(this));
        this.handlers.set('kanban.deleteLane', this.kanbanDeleteLane.bind(this));
        this.handlers.set('kanban.getBoard', this.kanbanGetBoard.bind(this));
        this.handlers.set('kanban.startTask', this.kanbanStartTask.bind(this));
        this.handlers.set('kanban.stopTask', this.kanbanStopTask.bind(this));
        // Runtime methods
        this.handlers.set('runtime.list', this.runtimeList.bind(this));
        this.handlers.set('runtime.add', this.runtimeAdd.bind(this));
        this.handlers.set('runtime.remove', this.runtimeRemove.bind(this));
        this.handlers.set('runtime.ping', this.runtimePing.bind(this));
        // Daemon methods
        this.handlers.set('daemon.health', this.daemonHealth.bind(this));
        this.handlers.set('daemon.config', this.daemonConfig.bind(this));
        this.handlers.set('daemon.reload', this.daemonReload.bind(this));
        this.handlers.set('daemon.stats', this.daemonStats.bind(this));
        this.handlers.set('daemon.shutdown', this.daemonShutdown.bind(this));
        // Fanout methods
        this.handlers.set('fanout.run', this.fanoutRun.bind(this));
        this.logger.info('rpcRouter', `Registered ${this.handlers.size} RPC methods`);
    }
    // Main routing function
    async handleRequest(request) {
        const startTime = Date.now();
        // Validate request structure
        if (request.jsonrpc !== '2.0') {
            return this.errorResponse(request.id, exports.RPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC version');
        }
        if (!request.method || typeof request.method !== 'string') {
            return this.errorResponse(request.id, exports.RPC_ERRORS.INVALID_REQUEST, 'Missing or invalid method');
        }
        // Look up handler
        const handler = this.handlers.get(request.method);
        if (!handler) {
            this.logger.warn('rpcRouter', `Method not found: ${request.method}`);
            return this.errorResponse(request.id, exports.RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${request.method}`);
        }
        // Execute handler
        try {
            this.logger.debug('rpcRouter', `Calling ${request.method}`, { params: request.params });
            const result = await handler(request.params || {});
            const duration = Date.now() - startTime;
            this.logger.debug('rpcRouter', `${request.method} completed`, { duration });
            return this.successResponse(request.id, result);
        }
        catch (err) {
            const duration = Date.now() - startTime;
            this.logger.error('rpcRouter', `${request.method} failed`, { error: err, duration });
            return this.errorResponse(request.id, exports.RPC_ERRORS.SERVER_ERROR, err.message || String(err), err);
        }
    }
    // Helper: success response
    successResponse(id, result) {
        return { jsonrpc: '2.0', id, result };
    }
    // Helper: error response
    errorResponse(id, error, customMessage, data) {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                code: error.code,
                message: customMessage || error.message,
                data
            }
        };
    }
    // ─── Agent Methods ───────────────────────────────────────────────────────
    async agentList(params) {
        const agents = this.context.orchestrator.getAllAgents();
        return agents.filter((a) => {
            if (params.status && a.state !== params.status)
                return false;
            if (params.role && a.role !== params.role)
                return false;
            if (params.team && a.teamId !== params.team)
                return false;
            if (params.runtime && a.runtimeId !== params.runtime)
                return false;
            return true;
        });
    }
    async agentGet(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const agent = this.context.orchestrator.getAgent(params.id);
        if (!agent)
            throw new Error(`Agent not found: ${params.id}`);
        return agent;
    }
    async agentSpawn(params) {
        if (!params.role)
            throw new Error('Missing required parameter: role');
        // Delegate to orchestrator's spawn method
        const agent = await this.context.orchestrator.spawnAgent({
            role: params.role,
            task: params.task,
            provider: params.provider,
            runtimeId: params.runtime,
            workingDirectory: params.workdir,
            teamId: params.team
        });
        return { id: agent.id, status: agent.state };
    }
    async agentKill(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.orchestrator.killAgent(params.id);
    }
    async agentSendPrompt(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        if (!params.prompt)
            throw new Error('Missing required parameter: prompt');
        return await this.context.orchestrator.sendPromptToAgent(params.id, params.prompt, params.wait);
    }
    async agentGetOutput(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        return await this.context.orchestrator.getAgentOutput(params.id, params.lines);
    }
    async agentGetStatus(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const agent = this.context.orchestrator.getAgent(params.id);
        if (!agent)
            throw new Error(`Agent not found: ${params.id}`);
        return agent.state;
    }
    async agentGetAttachCommand(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const agent = this.context.orchestrator.getAgent(params.id);
        if (!agent)
            throw new Error(`Agent not found: ${params.id}`);
        return `tmux attach-session -t ${agent.sessionName}:${agent.windowIndex}.${agent.paneIndex}`;
    }
    // ─── Task Methods ────────────────────────────────────────────────────────
    async taskList(params) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM tasks WHERE 1=1';
            const args = [];
            if (params.column) {
                query += ' AND kanbanColumn = ?';
                args.push(params.column);
            }
            if (params.lane) {
                query += ' AND swimLaneId = ?';
                args.push(params.lane);
            }
            this.context.db.all(query, args, (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows || []);
            });
        });
    }
    async taskGet(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        return new Promise((resolve, reject) => {
            this.context.db.get('SELECT * FROM tasks WHERE id = ?', [params.id], (err, row) => {
                if (err)
                    reject(err);
                else if (!row)
                    reject(new Error(`Task not found: ${params.id}`));
                else
                    resolve(row);
            });
        });
    }
    async taskSubmit(params) {
        if (!params.description)
            throw new Error('Missing required parameter: description');
        const task = await this.context.orchestrator.submitTask({
            description: params.description,
            priority: params.priority ?? 5,
            targetRole: params.role,
            swimLaneId: params.lane
        });
        return task;
    }
    async taskMove(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        if (!params.column)
            throw new Error('Missing required parameter: column');
        await this.context.kanbanManager?.moveTask(params.id, params.column);
    }
    async taskCancel(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.orchestrator.cancelTask(params.id);
    }
    async taskDelete(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        return new Promise((resolve, reject) => {
            this.context.db.run('DELETE FROM tasks WHERE id = ?', [params.id], (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async taskUpdate(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const { id, ...updates } = params;
        const fields = Object.keys(updates);
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => updates[f]);
        return new Promise((resolve, reject) => {
            this.context.db.run(`UPDATE tasks SET ${setClause} WHERE id = ?`, [...values, id], (err) => {
                if (err)
                    reject(err);
                else {
                    this.context.db.get('SELECT * FROM tasks WHERE id = ?', [id], (err2, row) => {
                        if (err2)
                            reject(err2);
                        else
                            resolve(row);
                    });
                }
            });
        });
    }
    // ─── Team Methods ────────────────────────────────────────────────────────
    async teamList(params) {
        return await this.context.teamManager?.getAllTeams() || [];
    }
    async teamCreate(params) {
        if (!params.name)
            throw new Error('Missing required parameter: name');
        return await this.context.teamManager?.createTeam({
            name: params.name,
            agents: params.agents || [],
            workingDirectory: params.workdir,
            runtimeId: params.runtime
        });
    }
    async teamDelete(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.teamManager?.deleteTeam(params.id);
    }
    async teamAddAgent(params) {
        if (!params.teamId)
            throw new Error('Missing required parameter: teamId');
        if (!params.agentId)
            throw new Error('Missing required parameter: agentId');
        await this.context.teamManager?.addAgentToTeam(params.teamId, params.agentId);
    }
    async teamRemoveAgent(params) {
        if (!params.teamId)
            throw new Error('Missing required parameter: teamId');
        if (!params.agentId)
            throw new Error('Missing required parameter: agentId');
        await this.context.teamManager?.removeAgentFromTeam(params.teamId, params.agentId);
    }
    async teamQuickCode(params) {
        if (!params.workdir)
            throw new Error('Missing required parameter: workdir');
        return await this.context.teamManager?.createQuickCodeTeam(params.workdir, params.runtime);
    }
    async teamQuickResearch(params) {
        if (!params.topic)
            throw new Error('Missing required parameter: topic');
        return await this.context.teamManager?.createQuickResearchTeam(params.topic, params.runtime);
    }
    // ─── Pipeline Methods ────────────────────────────────────────────────────
    async pipelineList(params) {
        return await this.context.pipelineEngine?.getAllPipelines() || [];
    }
    async pipelineCreate(params) {
        return await this.context.pipelineEngine?.createPipeline({
            name: params.name || 'Untitled Pipeline',
            stages: params.stages || [],
            description: params.description
        });
    }
    async pipelineRun(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const runId = await this.context.pipelineEngine?.runPipeline(params.id);
        return { runId };
    }
    async pipelineGetStatus(params) {
        if (!params.runId)
            throw new Error('Missing required parameter: runId');
        return await this.context.pipelineEngine?.getPipelineRunStatus(params.runId);
    }
    async pipelineGetActive(params) {
        return await this.context.pipelineEngine?.getActivePipelineRuns() || [];
    }
    async pipelinePause(params) {
        if (!params.runId)
            throw new Error('Missing required parameter: runId');
        await this.context.pipelineEngine?.pausePipelineRun(params.runId);
    }
    async pipelineResume(params) {
        if (!params.runId)
            throw new Error('Missing required parameter: runId');
        await this.context.pipelineEngine?.resumePipelineRun(params.runId);
    }
    async pipelineCancel(params) {
        if (!params.runId)
            throw new Error('Missing required parameter: runId');
        await this.context.pipelineEngine?.cancelPipelineRun(params.runId);
    }
    // ─── Kanban Methods ──────────────────────────────────────────────────────
    async kanbanListLanes(params) {
        return new Promise((resolve, reject) => {
            this.context.db.all('SELECT * FROM swim_lanes ORDER BY createdAt DESC', [], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows || []);
            });
        });
    }
    async kanbanCreateLane(params) {
        if (!params.name)
            throw new Error('Missing required parameter: name');
        return await this.context.kanbanManager?.createLane({
            name: params.name,
            workingDirectory: params.workdir,
            aiProvider: params.provider,
            runtimeId: params.runtime
        });
    }
    async kanbanEditLane(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        return await this.context.kanbanManager?.updateLane(params.id, params);
    }
    async kanbanDeleteLane(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.kanbanManager?.deleteLane(params.id);
    }
    async kanbanGetBoard(params) {
        const tasks = await this.taskList({ lane: params.lane });
        return {
            backlog: tasks.filter((t) => t.kanbanColumn === 'backlog'),
            todo: tasks.filter((t) => t.kanbanColumn === 'todo'),
            in_progress: tasks.filter((t) => t.kanbanColumn === 'in_progress'),
            in_review: tasks.filter((t) => t.kanbanColumn === 'in_review'),
            done: tasks.filter((t) => t.kanbanColumn === 'done')
        };
    }
    async kanbanStartTask(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.kanbanManager?.startTask(params.id);
    }
    async kanbanStopTask(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        await this.context.kanbanManager?.stopTask(params.id);
    }
    // ─── Runtime Methods ─────────────────────────────────────────────────────
    async runtimeList(params) {
        return this.context.config.runtimes || [];
    }
    async runtimeAdd(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        if (!params.type)
            throw new Error('Missing required parameter: type');
        this.context.config.runtimes.push(params);
        // Note: In a full implementation, we'd persist this to config file
    }
    async runtimeRemove(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const index = this.context.config.runtimes.findIndex((r) => r.id === params.id);
        if (index === -1)
            throw new Error(`Runtime not found: ${params.id}`);
        this.context.config.runtimes.splice(index, 1);
    }
    async runtimePing(params) {
        if (!params.id)
            throw new Error('Missing required parameter: id');
        const runtime = this.context.config.runtimes.find((r) => r.id === params.id);
        if (!runtime)
            throw new Error(`Runtime not found: ${params.id}`);
        const start = Date.now();
        const health = await this.context.healthChecker.checkRuntime(runtime);
        const latency = Date.now() - start;
        return {
            ok: health.status === 'healthy',
            latency
        };
    }
    // ─── Daemon Methods ──────────────────────────────────────────────────────
    async daemonHealth(params) {
        const serverStatus = {
            unixSocket: this.context.server?.unixSocketListening,
            http: this.context.server?.httpListening,
            webSocket: this.context.server?.wsListening
        };
        return await this.context.healthChecker.generateReport(this.context.db, serverStatus);
    }
    async daemonConfig(params) {
        return this.context.config;
    }
    async daemonReload(params) {
        await this.context.server?.reloadConfig();
    }
    async daemonStats(params) {
        const agents = this.context.orchestrator.getAllAgents();
        const tasks = await this.taskList({});
        return {
            agents: {
                total: agents.length,
                byState: this.groupBy(agents, 'state'),
                byRole: this.groupBy(agents, 'role')
            },
            tasks: {
                total: tasks.length,
                byStatus: this.groupBy(tasks, 'status'),
                byColumn: this.groupBy(tasks, 'kanbanColumn')
            },
            uptime: Math.floor((Date.now() - this.context.server?.startTime) / 1000),
            memory: process.memoryUsage()
        };
    }
    async daemonShutdown(params) {
        // Trigger graceful shutdown
        this.logger.info('rpcRouter', 'Shutdown requested via RPC');
        setTimeout(() => {
            this.context.server?.shutdown();
        }, 100);
    }
    // ─── Fanout Methods ──────────────────────────────────────────────────────
    async fanoutRun(params) {
        if (!params.prompt)
            throw new Error('Missing required parameter: prompt');
        const count = params.count || 3;
        const results = [];
        // Spawn multiple agents with the same prompt
        const agents = [];
        for (let i = 0; i < count; i++) {
            const agent = await this.agentSpawn({
                role: 'researcher',
                task: params.prompt,
                provider: params.provider,
                runtime: params.runtime
            });
            agents.push(agent);
        }
        // Wait for all to complete and collect outputs
        for (const agent of agents) {
            const output = await this.agentGetOutput({ id: agent.id });
            results.push(output);
        }
        return results;
    }
    // Helper: group array by property
    groupBy(arr, prop) {
        const result = {};
        for (const item of arr) {
            const key = item[prop] || 'unknown';
            result[key] = (result[key] || 0) + 1;
        }
        return result;
    }
}
exports.RpcRouter = RpcRouter;
//# sourceMappingURL=rpcRouter.js.map
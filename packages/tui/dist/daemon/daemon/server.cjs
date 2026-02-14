"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaemonServer = void 0;
exports.runDaemon = runDaemon;
const config_1 = require("./config.cjs");
const log_1 = require("./log.cjs");
const eventBus_1 = require("./eventBus.cjs");
const rpcRouter_1 = require("./rpcRouter.cjs");
const apiHandler_1 = require("./apiHandler.cjs");
const health_1 = require("./health.cjs");
const reconciler_1 = require("./reconciler.cjs");
// ─── Daemon Server ───────────────────────────────────────────────────────────
class DaemonServer {
    constructor(configPath) {
        this.unixSocketListening = false;
        this.httpListening = false;
        this.wsListening = false;
        // Load configuration
        this.config = (0, config_1.loadConfig)(configPath);
        const errors = (0, config_1.validateConfig)(this.config);
        if (errors.length > 0) {
            throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
        }
        // Ensure data directory exists
        (0, config_1.ensureDataDir)(this.config);
        // Initialize logger
        this.logger = new log_1.Logger({
            minLevel: this.config.logLevel,
            logFilePath: this.config.logFile,
            logToStdout: this.config.logToStdout,
            maxFileSize: this.config.maxLogFileSize,
            maxFiles: this.config.maxLogFiles
        });
        this.logger.info('daemon', 'Daemon server initializing', {
            pid: process.pid,
            dataDir: this.config.dataDir
        });
        // Initialize event bus
        this.eventBus = new eventBus_1.DaemonEventBus(this.logger);
        // Initialize health checker
        this.healthChecker = new health_1.HealthChecker(this.config, this.logger);
        // Initialize reconciler
        this.reconciler = new reconciler_1.Reconciler(this.config, this.logger);
        this.startTime = Date.now();
    }
    // Start the daemon server
    async start() {
        try {
            this.logger.info('daemon', 'Starting daemon server');
            // Step 1: Initialize database
            await this.initializeDatabase();
            // Step 2: Initialize core services
            await this.initializeServices();
            // Step 3: Initialize RPC router
            this.initializeRpcRouter();
            // Step 4: Start API servers
            await this.startApiServers();
            // Step 5: Run reconciliation
            if (this.config.reconcileOnStart) {
                await this.runReconciliation();
            }
            // Step 6: Start monitoring (placeholder for AutoMonitor)
            this.startMonitoring();
            this.logger.info('daemon', 'Daemon server started successfully', {
                pid: process.pid,
                uptime: 0
            });
        }
        catch (err) {
            this.logger.error('daemon', 'Failed to start daemon server', { error: err });
            throw err;
        }
    }
    // Graceful shutdown
    async shutdown() {
        this.logger.info('daemon', 'Shutting down daemon server');
        try {
            // Stop API servers
            if (this.apiHandler) {
                await this.apiHandler.stop();
            }
            // Close event bus clients
            if (this.eventBus) {
                this.eventBus.closeAllClients();
            }
            // Flush database
            if (this.db && this.db.close) {
                await new Promise((resolve) => {
                    this.db.close(() => {
                        this.logger.info('daemon', 'Database closed');
                        resolve();
                    });
                });
            }
            // Close logger
            if (this.logger) {
                this.logger.info('daemon', 'Daemon server shutdown complete');
                this.logger.close();
            }
        }
        catch (err) {
            console.error('Error during shutdown:', err);
        }
        process.exit(0);
    }
    // Reload configuration
    async reloadConfig() {
        this.logger.info('daemon', 'Reloading configuration');
        try {
            const newConfig = (0, config_1.loadConfig)();
            const errors = (0, config_1.validateConfig)(newConfig);
            if (errors.length > 0) {
                throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
            }
            this.config = newConfig;
            this.logger.info('daemon', 'Configuration reloaded successfully');
        }
        catch (err) {
            this.logger.error('daemon', 'Failed to reload configuration', { error: err });
            throw err;
        }
    }
    // ─── Initialization Steps ────────────────────────────────────────────────
    async initializeDatabase() {
        this.logger.info('daemon', 'Initializing database', { path: this.config.dbFile });
        // Import Database class dynamically
        try {
            const DatabaseModule = require("../database.cjs");
            const Database = DatabaseModule.Database;
            this.db = new Database(this.config.dbFile);
            await this.db.initialize();
            this.logger.info('daemon', 'Database initialized');
        }
        catch (err) {
            this.logger.error('daemon', 'Database initialization failed', { error: err });
            // Fallback: use simple sqlite3 if Database class not available
            const sqlite3 = require('sqlite3').verbose();
            this.db = new sqlite3.Database(this.config.dbFile);
            // Create basic tables
            await new Promise((resolve, reject) => {
                this.db.run(`CREATE TABLE IF NOT EXISTS agent_instances (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        role TEXT,
                        state TEXT,
                        sessionName TEXT,
                        tmuxSessionName TEXT,
                        runtimeId TEXT,
                        containerId TEXT,
                        podName TEXT,
                        namespace TEXT,
                        createdAt INTEGER
                    )`, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            await new Promise((resolve, reject) => {
                this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
                        id TEXT PRIMARY KEY,
                        description TEXT,
                        status TEXT,
                        kanbanColumn TEXT,
                        swimLaneId TEXT,
                        priority INTEGER,
                        createdAt INTEGER
                    )`, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            await new Promise((resolve, reject) => {
                this.db.run(`CREATE TABLE IF NOT EXISTS swim_lanes (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        serverId TEXT,
                        workingDirectory TEXT,
                        sessionName TEXT,
                        createdAt INTEGER
                    )`, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            this.logger.info('daemon', 'Fallback database initialized');
        }
    }
    async initializeServices() {
        this.logger.info('daemon', 'Initializing core services');
        // Import and initialize orchestrator
        try {
            const OrchestratorModule = require("../orchestrator.cjs");
            const AgentOrchestrator = OrchestratorModule.AgentOrchestrator;
            // Create mock vscode context for orchestrator (daemon doesn't have VS Code)
            const mockContext = {
                subscriptions: [],
                extensionPath: process.cwd(),
                globalState: {
                    get: () => undefined,
                    update: async () => { }
                },
                workspaceState: {
                    get: () => undefined,
                    update: async () => { }
                }
            };
            this.orchestrator = new AgentOrchestrator(this.db, this.eventBus, null, // No TmuxService in daemon mode
            mockContext);
            this.logger.info('daemon', 'Orchestrator initialized');
        }
        catch (err) {
            this.logger.warn('daemon', 'Orchestrator initialization failed, using mock', { error: err });
            this.orchestrator = this.createMockOrchestrator();
        }
        // Import and initialize pipeline engine
        try {
            const PipelineModule = require("../core/pipelineEngine.cjs");
            const PipelineEngine = PipelineModule.PipelineEngine;
            this.pipelineEngine = new PipelineEngine(this.db, this.orchestrator, this.eventBus);
            this.logger.info('daemon', 'Pipeline engine initialized');
        }
        catch (err) {
            this.logger.warn('daemon', 'Pipeline engine initialization failed, using mock', { error: err });
            this.pipelineEngine = this.createMockPipelineEngine();
        }
        // Team manager (mock for now)
        this.teamManager = this.createMockTeamManager();
        // Kanban manager (mock for now)
        this.kanbanManager = this.createMockKanbanManager();
        // Runtime manager (mock for now)
        this.runtimeManager = null;
        this.logger.info('daemon', 'Core services initialized');
    }
    initializeRpcRouter() {
        this.logger.info('daemon', 'Initializing RPC router');
        const context = {
            db: this.db,
            orchestrator: this.orchestrator,
            pipelineEngine: this.pipelineEngine,
            teamManager: this.teamManager,
            kanbanManager: this.kanbanManager,
            runtimeManager: this.runtimeManager,
            config: this.config,
            healthChecker: this.healthChecker,
            server: this
        };
        this.rpcRouter = new rpcRouter_1.RpcRouter(context, this.logger);
        this.logger.info('daemon', 'RPC router initialized');
    }
    async startApiServers() {
        this.logger.info('daemon', 'Starting API servers');
        this.apiHandler = new apiHandler_1.ApiHandler(this.config, this.logger, this.rpcRouter, this.eventBus);
        await this.apiHandler.start();
        this.unixSocketListening = this.apiHandler.unixSocketListening;
        this.httpListening = this.apiHandler.httpListening;
        this.wsListening = this.apiHandler.wsListening;
        this.logger.info('daemon', 'API servers started');
    }
    async runReconciliation() {
        this.logger.info('daemon', 'Running agent reconciliation');
        try {
            const result = await this.reconciler.reconcile(this.db, this.orchestrator);
            this.logger.info('daemon', 'Reconciliation complete', result);
        }
        catch (err) {
            this.logger.error('daemon', 'Reconciliation failed', { error: err });
        }
    }
    startMonitoring() {
        this.logger.info('daemon', 'Starting monitoring');
        // Placeholder: In a full implementation, we'd start AutoMonitor here
    }
    // ─── Mock Services (for testing/fallback) ────────────────────────────────
    createMockOrchestrator() {
        return {
            getAllAgents: () => [],
            getAgent: (id) => null,
            spawnAgent: async (params) => ({ id: 'mock-agent', state: 'idle' }),
            killAgent: async (id) => { },
            sendPromptToAgent: async (id, prompt, wait) => '',
            getAgentOutput: async (id, lines) => '',
            submitTask: async (params) => ({ id: 'mock-task', ...params }),
            cancelTask: async (id) => { }
        };
    }
    createMockPipelineEngine() {
        return {
            getAllPipelines: async () => [],
            createPipeline: async (params) => ({ id: 'mock-pipeline', ...params }),
            runPipeline: async (id) => 'mock-run-id',
            getPipelineRunStatus: async (runId) => ({ id: runId, status: 'running' }),
            getActivePipelineRuns: async () => [],
            pausePipelineRun: async (runId) => { },
            resumePipelineRun: async (runId) => { },
            cancelPipelineRun: async (runId) => { }
        };
    }
    createMockTeamManager() {
        return {
            getAllTeams: async () => [],
            createTeam: async (params) => ({ id: 'mock-team', ...params }),
            deleteTeam: async (id) => { },
            addAgentToTeam: async (teamId, agentId) => { },
            removeAgentFromTeam: async (teamId, agentId) => { },
            createQuickCodeTeam: async (workdir, runtime) => ({ id: 'mock-team' }),
            createQuickResearchTeam: async (topic, runtime) => ({ id: 'mock-team' })
        };
    }
    createMockKanbanManager() {
        return {
            createLane: async (params) => ({ id: 'mock-lane', ...params }),
            updateLane: async (id, params) => ({ id, ...params }),
            deleteLane: async (id) => { },
            moveTask: async (taskId, column) => { },
            startTask: async (taskId) => { },
            stopTask: async (taskId) => { }
        };
    }
}
exports.DaemonServer = DaemonServer;
// ─── Main Entry Point (for daemon run) ───────────────────────────────────────
async function runDaemon(configPath) {
    const server = new DaemonServer(configPath);
    // Signal handlers
    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM, shutting down gracefully...');
        await server.shutdown();
    });
    process.on('SIGINT', async () => {
        console.log('Received SIGINT, shutting down gracefully...');
        await server.shutdown();
    });
    process.on('SIGHUP', async () => {
        console.log('Received SIGHUP, reloading configuration...');
        try {
            await server.reloadConfig();
        }
        catch (err) {
            console.error('Failed to reload config:', err);
        }
    });
    // Start the server
    await server.start();
}
//# sourceMappingURL=server.js.map
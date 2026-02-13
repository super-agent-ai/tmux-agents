// ─── Main Daemon Server ──────────────────────────────────────────────────────

import { Database } from '../core/database';
import { AgentOrchestrator, IAIAssistantManager } from '../core/orchestrator';
import { PipelineEngine } from '../core/pipelineEngine';
import { EventBus } from '../core/eventBus';
import { AIProvider, AIStatus } from '../core/types';
import { Logger } from './log';
import { DaemonConfig, loadConfig, validateConfig, ensureDirectories } from './config';
import { HealthChecker } from './health';
import { Reconciler } from './reconciler';
import { RpcRouter } from './rpcRouter';
import { ApiHandler } from './apiHandler';

/**
 * DaemonServer - Main daemon process
 *
 * Lifecycle:
 * 1. Load config
 * 2. Initialize database
 * 3. Initialize core services (orchestrator, pipeline engine)
 * 4. Start API servers (Unix socket, HTTP, WebSocket)
 * 5. Run reconciler (reconnect to running agents)
 * 6. Start auto-monitor
 * 7. Handle shutdown signals
 */
export class DaemonServer {
	private config: DaemonConfig;
	private logger: Logger;
	private db?: Database;
	private eventBus: EventBus;
	private orchestrator: AgentOrchestrator;
	private pipelineEngine: PipelineEngine;
	private healthChecker: HealthChecker;
	private reconciler?: Reconciler;
	private rpcRouter?: RpcRouter;
	private apiHandler?: ApiHandler;
	private running = false;

	constructor(configPath?: string) {
		// Load configuration
		this.config = loadConfig(configPath);

		// Validate configuration
		const errors = validateConfig(this.config);
		if (errors.length > 0) {
			throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
		}

		// Ensure directories exist
		ensureDirectories(this.config);

		// Initialize logger
		this.logger = new Logger(this.config.logLevel);

		this.logger.info('server', 'Daemon server initializing', {
			config: this.config,
		});

		// Initialize core services
		this.eventBus = new EventBus();

		// Create stub AI assistant manager for daemon (no VS Code dependencies)
		const stubAIManager: IAIAssistantManager = {
			detectAIStatus: (_provider: AIProvider, _content: string): AIStatus => AIStatus.IDLE,
			mapCcStateToAIStatus: (_ccState: string): AIStatus | null => null,
		};

		this.orchestrator = new AgentOrchestrator(stubAIManager);
		this.pipelineEngine = new PipelineEngine();
		this.healthChecker = new HealthChecker();
	}

	/**
	 * Start the daemon server
	 */
	async start(): Promise<void> {
		if (this.running) {
			throw new Error('Server already running');
		}

		this.logger.info('server', 'Starting daemon server');

		try {
			// Initialize database
			this.db = new Database(this.config.dbPath);
			await this.db.initialize();
			this.logger.info('server', 'Database initialized');

			// Initialize RPC router
			this.rpcRouter = new RpcRouter(
				this.db,
				this.orchestrator,
				this.pipelineEngine,
				this.healthChecker,
				this.config,
				this.logger
			);

			// Initialize API handler
			this.apiHandler = new ApiHandler(
				this.rpcRouter,
				this.eventBus,
				this.config,
				this.logger
			);
			await this.apiHandler.start();
			this.logger.info('server', 'API servers started');

			// Run reconciler if enabled
			if (this.config.reconcileOnStart) {
				this.reconciler = new Reconciler(this.db, this.orchestrator, this.logger);
				const result = await this.reconciler.reconcile();
				this.logger.info('server', 'Reconciliation complete', result);
			}

			// Set up signal handlers
			this.setupSignalHandlers();

			this.running = true;
			this.logger.info('server', 'Daemon server started successfully');
		} catch (error) {
			this.logger.error('server', 'Failed to start daemon server', {
				error: String(error),
			});
			await this.stop();
			throw error;
		}
	}

	/**
	 * Stop the daemon server
	 */
	async stop(): Promise<void> {
		if (!this.running) {
			return;
		}

		this.logger.info('server', 'Stopping daemon server');

		try {
			// Stop API handler
			if (this.apiHandler) {
				await this.apiHandler.stop();
			}

			// Database auto-saves, no manual flush needed

			this.running = false;
			this.logger.info('server', 'Daemon server stopped');
		} catch (error) {
			this.logger.error('server', 'Error during shutdown', {
				error: String(error),
			});
		}
	}

	/**
	 * Reload configuration
	 */
	async reload(): Promise<void> {
		this.logger.info('server', 'Reloading configuration');

		try {
			const newConfig = loadConfig();
			const errors = validateConfig(newConfig);
			if (errors.length > 0) {
				throw new Error(`Invalid configuration: ${errors.join(', ')}`);
			}

			// Update log level
			if (newConfig.logLevel !== this.config.logLevel) {
				this.logger.setLevel(newConfig.logLevel);
			}

			this.config = newConfig;
			this.logger.info('server', 'Configuration reloaded');
		} catch (error) {
			this.logger.error('server', 'Failed to reload configuration', {
				error: String(error),
			});
		}
	}

	/**
	 * Set up signal handlers for graceful shutdown
	 */
	private setupSignalHandlers(): void {
		// SIGTERM: graceful shutdown
		process.on('SIGTERM', async () => {
			this.logger.info('server', 'Received SIGTERM, shutting down gracefully');
			await this.stop();
			process.exit(0);
		});

		// SIGINT: graceful shutdown (Ctrl+C)
		process.on('SIGINT', async () => {
			this.logger.info('server', 'Received SIGINT, shutting down gracefully');
			await this.stop();
			process.exit(0);
		});

		// SIGHUP: reload configuration
		process.on('SIGHUP', async () => {
			this.logger.info('server', 'Received SIGHUP, reloading configuration');
			await this.reload();
		});

		// Handle uncaught errors
		process.on('uncaughtException', (error) => {
			this.logger.error('server', 'Uncaught exception', {
				error: String(error),
				stack: error.stack,
			});
			// Don't exit immediately, let supervisor handle restart
		});

		process.on('unhandledRejection', (reason) => {
			this.logger.error('server', 'Unhandled rejection', {
				reason: String(reason),
			});
		});
	}

	/**
	 * Get server status
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Get configuration
	 */
	getConfig(): DaemonConfig {
		return this.config;
	}
}

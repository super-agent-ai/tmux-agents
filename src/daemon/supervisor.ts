// ─── Supervisor (Watchdog Process) ───────────────────────────────────────────

import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { DaemonConfig, loadConfig } from './config';

/**
 * Supervisor - Watchdog process that forks and monitors the worker
 *
 * Features:
 * - Forks worker process (server.ts)
 * - Writes PID file
 * - Monitors child process, restarts on crash
 * - Circuit breaker: max restarts in time window
 * - Signal handling: SIGTERM → graceful shutdown, SIGHUP → reload config
 * - Daemonization: detach from terminal, redirect stdio to log file
 */
export class Supervisor {
	private config: DaemonConfig;
	private child?: cp.ChildProcess;
	private pidFile: string;
	private restartCount = 0;
	private restartWindow: { timestamp: number }[] = [];
	private stopping = false;

	constructor(configPath?: string) {
		this.config = loadConfig(configPath);
		this.pidFile = this.config.pidFile;
	}

	/**
	 * Start supervisor in daemon mode
	 */
	async start(): Promise<void> {
		// Check if already running
		if (this.isRunning()) {
			throw new Error('Daemon already running');
		}

		console.log('[Supervisor] Starting daemon in background mode');

		// Daemonize: detach from terminal
		if (process.env.DAEMON_FOREGROUND !== '1') {
			this.daemonize();
			return;
		}

		// Fork worker process
		await this.forkWorker();

		// Write PID file
		this.writePidFile();

		// Set up signal handlers
		this.setupSignalHandlers();

		console.log('[Supervisor] Supervisor started (PID: %d)', process.pid);
	}

	/**
	 * Stop supervisor and worker
	 */
	async stop(): Promise<void> {
		if (this.stopping) {
			return;
		}

		this.stopping = true;
		console.log('[Supervisor] Stopping daemon');

		// Kill worker process
		if (this.child && !this.child.killed) {
			this.child.kill('SIGTERM');

			// Wait for graceful shutdown (max 10s)
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					if (this.child && !this.child.killed) {
						console.log('[Supervisor] Worker did not stop gracefully, sending SIGKILL');
						this.child.kill('SIGKILL');
					}
					resolve();
				}, 10000);

				if (this.child) {
					this.child.on('exit', () => {
						clearTimeout(timeout);
						resolve();
					});
				} else {
					clearTimeout(timeout);
					resolve();
				}
			});
		}

		// Remove PID file
		this.removePidFile();

		console.log('[Supervisor] Daemon stopped');
	}

	/**
	 * Reload worker configuration
	 */
	async reload(): Promise<void> {
		console.log('[Supervisor] Reloading configuration');

		if (this.child && !this.child.killed) {
			this.child.kill('SIGHUP');
		}
	}

	/**
	 * Check if daemon is running
	 */
	isRunning(): boolean {
		if (!fs.existsSync(this.pidFile)) {
			return false;
		}

		try {
			const pid = parseInt(fs.readFileSync(this.pidFile, 'utf-8').trim(), 10);
			// Check if process exists
			process.kill(pid, 0);
			return true;
		} catch {
			// Process doesn't exist, clean up stale PID file
			this.removePidFile();
			return false;
		}
	}

	/**
	 * Get daemon PID
	 */
	getPid(): number | null {
		if (!fs.existsSync(this.pidFile)) {
			return null;
		}

		try {
			return parseInt(fs.readFileSync(this.pidFile, 'utf-8').trim(), 10);
		} catch {
			return null;
		}
	}

	/**
	 * Get daemon config
	 */
	getConfig(): DaemonConfig {
		return this.config;
	}

	// ─── Private Methods ─────────────────────────────────────────────────────

	/**
	 * Fork worker process
	 */
	private async forkWorker(): Promise<void> {
		const workerPath = path.join(__dirname, 'worker.js');

		console.log('[Supervisor] Forking worker process: %s', workerPath);

		this.child = cp.fork(workerPath, [], {
			detached: false,
			stdio: process.env.DAEMON_FOREGROUND === '1' ? 'inherit' : 'ignore',
			env: {
				...process.env,
				DAEMON_WORKER: '1',
			},
		});

		this.child.on('exit', (code, signal) => {
			console.log('[Supervisor] Worker exited (code: %s, signal: %s)', code, signal);

			if (this.stopping) {
				return;
			}

			// Check circuit breaker
			if (this.shouldRestart()) {
				console.log('[Supervisor] Restarting worker (restart %d)', this.restartCount + 1);
				this.restartCount++;
				this.restartWindow.push({ timestamp: Date.now() });
				setTimeout(() => this.forkWorker(), 1000);
			} else {
				console.error('[Supervisor] Circuit breaker triggered, backing off for 60s');
				setTimeout(() => {
					this.restartWindow = [];
					this.restartCount = 0;
					this.forkWorker();
				}, this.config.backoffDelay);
			}
		});

		this.child.on('error', (error) => {
			console.error('[Supervisor] Worker error:', error);
		});
	}

	/**
	 * Check if we should restart (circuit breaker)
	 */
	private shouldRestart(): boolean {
		// Clean up old restart records outside the window
		const now = Date.now();
		this.restartWindow = this.restartWindow.filter(
			(r) => now - r.timestamp < this.config.restartWindow
		);

		// Check if we've exceeded max restarts in the window
		return this.restartWindow.length < this.config.maxRestarts;
	}

	/**
	 * Daemonize: detach from terminal and re-exec in background
	 */
	private daemonize(): void {
		// Spawn detached process
		const child = cp.spawn(process.argv[0], process.argv.slice(1), {
			detached: true,
			stdio: 'ignore',
			env: {
				...process.env,
				DAEMON_FOREGROUND: '1',
			},
		});

		child.unref();

		console.log('[Supervisor] Daemon started (PID: %d)', child.pid);
		process.exit(0);
	}

	/**
	 * Write PID file
	 */
	private writePidFile(): void {
		const dir = path.dirname(this.pidFile);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(this.pidFile, String(process.pid), 'utf-8');
	}

	/**
	 * Remove PID file
	 */
	private removePidFile(): void {
		if (fs.existsSync(this.pidFile)) {
			fs.unlinkSync(this.pidFile);
		}
	}

	/**
	 * Set up signal handlers
	 */
	private setupSignalHandlers(): void {
		process.on('SIGTERM', async () => {
			await this.stop();
			process.exit(0);
		});

		process.on('SIGINT', async () => {
			await this.stop();
			process.exit(0);
		});

		process.on('SIGHUP', async () => {
			await this.reload();
		});
	}
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────

/**
 * Main entry point when running supervisor directly from command line
 */
async function main() {
	const command = process.argv[2] || 'start';
	const configPath = process.argv[3];

	const supervisor = new Supervisor(configPath);

	try {
		switch (command) {
			case 'start':
				await supervisor.start();
				break;

			case 'stop':
				await supervisor.stop();
				process.exit(0);
				break;

			case 'reload':
				await supervisor.reload();
				process.exit(0);
				break;

			case 'status':
				if (supervisor.isRunning()) {
					const pid = supervisor.getPid();
					console.log(`Daemon is running (PID: ${pid})`);
					process.exit(0);
				} else {
					console.log('Daemon is not running');
					process.exit(1);
				}
				break;

			default:
				console.error(`Unknown command: ${command}`);
				console.error('Usage: supervisor [start|stop|reload|status] [config-path]');
				process.exit(1);
		}
	} catch (error: any) {
		console.error(`[Supervisor] Error: ${error.message}`);
		process.exit(1);
	}
}

// Run main if this file is executed directly
if (require.main === module) {
	main();
}

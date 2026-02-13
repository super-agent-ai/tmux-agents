// ─── Health Check Logic ──────────────────────────────────────────────────────

import { Database } from '../core/database';
import { RuntimeConfig } from './config';
import * as cp from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(cp.exec);

export interface ComponentHealth {
	name: string;
	status: 'healthy' | 'unhealthy' | 'degraded';
	message?: string;
	latency?: number;
}

export interface HealthReport {
	overall: 'healthy' | 'unhealthy' | 'degraded';
	timestamp: string;
	uptime: number;
	components: ComponentHealth[];
}

export class HealthChecker {
	private startTime: number;

	constructor() {
		this.startTime = Date.now();
	}

	/**
	 * Generate complete health report
	 */
	async getHealthReport(
		db: Database,
		runtimes: RuntimeConfig[]
	): Promise<HealthReport> {
		const components: ComponentHealth[] = [];

		// Check database
		components.push(await this.checkDatabase(db));

		// Check each runtime
		for (const runtime of runtimes) {
			components.push(await this.checkRuntime(runtime));
		}

		// Determine overall status
		const hasUnhealthy = components.some(c => c.status === 'unhealthy');
		const hasDegraded = components.some(c => c.status === 'degraded');
		const overall = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

		return {
			overall,
			timestamp: new Date().toISOString(),
			uptime: Date.now() - this.startTime,
			components,
		};
	}

	/**
	 * Check database health
	 */
	private async checkDatabase(db: Database): Promise<ComponentHealth> {
		try {
			const start = Date.now();
			// Simple query to verify database is responsive
			await db.getAllSwimLanes();
			const latency = Date.now() - start;

			return {
				name: 'database',
				status: 'healthy',
				latency,
			};
		} catch (error) {
			return {
				name: 'database',
				status: 'unhealthy',
				message: `Database error: ${error}`,
			};
		}
	}

	/**
	 * Check runtime health
	 */
	private async checkRuntime(runtime: RuntimeConfig): Promise<ComponentHealth> {
		const start = Date.now();

		try {
			switch (runtime.type) {
				case 'local-tmux':
					return await this.checkTmux(runtime, start);
				case 'docker':
					return await this.checkDocker(runtime, start);
				case 'k8s':
					return await this.checkK8s(runtime, start);
				case 'ssh':
					return await this.checkSsh(runtime, start);
				default:
					return {
						name: `runtime:${runtime.id}`,
						status: 'unhealthy',
						message: `Unknown runtime type: ${runtime.type}`,
					};
			}
		} catch (error) {
			return {
				name: `runtime:${runtime.id}`,
				status: 'unhealthy',
				message: `${error}`,
			};
		}
	}

	/**
	 * Check local tmux availability
	 */
	private async checkTmux(runtime: RuntimeConfig, start: number): Promise<ComponentHealth> {
		try {
			await execAsync('tmux list-sessions 2>/dev/null || true');
			const latency = Date.now() - start;
			return {
				name: `runtime:${runtime.id}`,
				status: 'healthy',
				latency,
			};
		} catch (error) {
			return {
				name: `runtime:${runtime.id}`,
				status: 'unhealthy',
				message: 'tmux not available',
			};
		}
	}

	/**
	 * Check Docker availability
	 */
	private async checkDocker(runtime: RuntimeConfig, start: number): Promise<ComponentHealth> {
		try {
			await execAsync('docker info');
			const latency = Date.now() - start;
			return {
				name: `runtime:${runtime.id}`,
				status: 'healthy',
				latency,
			};
		} catch (error) {
			return {
				name: `runtime:${runtime.id}`,
				status: 'unhealthy',
				message: 'Docker daemon not available',
			};
		}
	}

	/**
	 * Check Kubernetes availability
	 */
	private async checkK8s(runtime: RuntimeConfig, start: number): Promise<ComponentHealth> {
		try {
			const context = runtime.context || 'default';
			await execAsync(`kubectl get nodes --context=${context}`);
			const latency = Date.now() - start;
			return {
				name: `runtime:${runtime.id}`,
				status: 'healthy',
				latency,
			};
		} catch (error) {
			return {
				name: `runtime:${runtime.id}`,
				status: 'degraded',
				message: 'Kubernetes context not reachable',
			};
		}
	}

	/**
	 * Check SSH availability
	 */
	private async checkSsh(runtime: RuntimeConfig, start: number): Promise<ComponentHealth> {
		try {
			const host = runtime.host || 'localhost';
			const user = runtime.user || '';
			const target = user ? `${user}@${host}` : host;
			await execAsync(`ssh -o BatchMode=yes -o ConnectTimeout=5 ${target} echo ok`, {
				timeout: 10000,
			});
			const latency = Date.now() - start;
			return {
				name: `runtime:${runtime.id}`,
				status: 'healthy',
				latency,
			};
		} catch (error) {
			return {
				name: `runtime:${runtime.id}`,
				status: 'degraded',
				message: 'SSH connection failed',
			};
		}
	}
}

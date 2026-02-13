// ─── Health Tests ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthChecker } from '../../daemon/health';
import { Database } from '../../core/database';
import { RuntimeConfig } from '../../daemon/config';
import * as cp from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
	exec: vi.fn(),
}));

describe('HealthChecker', () => {
	let healthChecker: HealthChecker;
	let mockDb: any;

	beforeEach(() => {
		healthChecker = new HealthChecker();
		mockDb = {
			getAllSwimLanes: vi.fn().mockResolvedValue([]),
		};
	});

	it('should report healthy database', async () => {
		const runtimes: RuntimeConfig[] = [];
		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.overall).toBe('healthy');
		expect(report.components).toHaveLength(1);
		expect(report.components[0].name).toBe('database');
		expect(report.components[0].status).toBe('healthy');
	});

	it('should report unhealthy database on error', async () => {
		mockDb.getAllSwimLanes.mockRejectedValue(new Error('DB error'));

		const runtimes: RuntimeConfig[] = [];
		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.overall).toBe('unhealthy');
		expect(report.components[0].status).toBe('unhealthy');
		expect(report.components[0].message).toContain('Database error');
	});

	it('should check tmux runtime', async () => {
		const runtimes: RuntimeConfig[] = [
			{ id: 'local', type: 'local-tmux' },
		];

		// Mock successful tmux check
		const execMock = vi.mocked(cp.exec);
		execMock.mockImplementation((cmd: any, callback: any) => {
			callback(null, { stdout: '', stderr: '' });
			return {} as any;
		});

		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.components).toHaveLength(2); // db + runtime
		const runtimeComponent = report.components.find(c => c.name === 'runtime:local');
		expect(runtimeComponent).toBeDefined();
		expect(runtimeComponent?.status).toBe('healthy');
	});

	it('should report degraded status when runtime unhealthy', async () => {
		mockDb.getAllSwimLanes.mockResolvedValue([]);

		const runtimes: RuntimeConfig[] = [
			{ id: 'docker1', type: 'docker' },
		];

		// Mock failed docker check
		const execMock = vi.mocked(cp.exec);
		execMock.mockImplementation((cmd: any, callback: any) => {
			callback(new Error('Docker not available'));
			return {} as any;
		});

		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.overall).toBe('unhealthy');
		const runtimeComponent = report.components.find(c => c.name === 'runtime:docker1');
		expect(runtimeComponent?.status).toBe('unhealthy');
	});

	it('should include uptime in report', async () => {
		const runtimes: RuntimeConfig[] = [];

		// Wait a bit to get non-zero uptime
		await new Promise(resolve => setTimeout(resolve, 10));

		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.uptime).toBeGreaterThan(0);
		expect(report.timestamp).toBeDefined();
	});

	it('should include latency for healthy components', async () => {
		mockDb.getAllSwimLanes.mockImplementation(() => {
			return new Promise(resolve => setTimeout(() => resolve([]), 10));
		});

		const runtimes: RuntimeConfig[] = [];
		const report = await healthChecker.getHealthReport(mockDb, runtimes);

		expect(report.components[0].latency).toBeGreaterThan(0);
	});
});

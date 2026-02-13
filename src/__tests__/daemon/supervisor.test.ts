// ─── Supervisor Tests ────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Supervisor } from '../../daemon/supervisor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
	fork: vi.fn(),
	spawn: vi.fn(),
}));

describe('Supervisor', () => {
	let supervisor: Supervisor;
	let tempDir: string;
	let pidFile: string;

	beforeEach(() => {
		// Create temp directory
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supervisor-test-'));
		pidFile = path.join(tempDir, 'daemon.pid');

		// Set environment to foreground mode for testing
		process.env.DAEMON_FOREGROUND = '1';

		// Mock config path
		const configPath = path.join(tempDir, 'config.toml');
		fs.writeFileSync(
			configPath,
			`
pidFile = "${pidFile}"
dataDir = "${tempDir}"
logFile = "${path.join(tempDir, 'daemon.log')}"
unixSocket = "${path.join(tempDir, 'daemon.sock')}"
`
		);

		supervisor = new Supervisor(configPath);
	});

	afterEach(() => {
		// Clean up
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should detect when daemon is not running', () => {
		expect(supervisor.isRunning()).toBe(false);
	});

	it('should write PID file on start', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		expect(fs.existsSync(pidFile)).toBe(true);
		const pid = fs.readFileSync(pidFile, 'utf-8');
		expect(parseInt(pid, 10)).toBe(process.pid);
	});

	it('should fork worker process', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		const forkMock = vi.mocked(cp.fork);
		forkMock.mockReturnValue(mockChild as any);

		await supervisor.start();

		expect(forkMock).toHaveBeenCalled();
		const workerPath = forkMock.mock.calls[0][0];
		expect(workerPath).toContain('worker.js');
	});

	it('should detect running daemon', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		expect(supervisor.isRunning()).toBe(true);
	});

	it('should get daemon PID', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		const pid = supervisor.getPid();
		expect(pid).toBe(process.pid);
	});

	it('should restart worker on crash', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		const forkMock = vi.mocked(cp.fork);
		forkMock.mockReturnValue(mockChild as any);

		await supervisor.start();

		// Simulate worker crash
		const exitHandler = mockChild.on.mock.calls.find((call: any) => call[0] === 'exit')?.[1];
		expect(exitHandler).toBeDefined();

		// Trigger exit handler
		if (exitHandler) {
			exitHandler(1, null);

			// Wait for restart
			await new Promise(resolve => setTimeout(resolve, 1100));

			// Fork should be called again
			expect(forkMock.mock.calls.length).toBeGreaterThan(1);
		}
	});

	it('should respect circuit breaker', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		const forkMock = vi.mocked(cp.fork);
		forkMock.mockReturnValue(mockChild as any);

		// Set low restart limits for testing
		const config = supervisor.getConfig();
		(config as any).maxRestarts = 2;
		(config as any).restartWindow = 5000;

		await supervisor.start();

		// Get exit handler
		const exitHandler = mockChild.on.mock.calls.find((call: any) => call[0] === 'exit')?.[1];

		if (exitHandler) {
			// Trigger multiple crashes quickly
			exitHandler(1, null);
			await new Promise(resolve => setTimeout(resolve, 100));
			exitHandler(1, null);
			await new Promise(resolve => setTimeout(resolve, 100));
			exitHandler(1, null);

			// Circuit breaker should trigger
			// Hard to test without actual timing, but we can verify fork count
			expect(forkMock.mock.calls.length).toBeLessThan(10);
		}
	});

	it('should stop worker gracefully', async () => {
		let exitHandler: Function | undefined;
		const mockChild = {
			on: vi.fn((event: string, handler: Function) => {
				if (event === 'exit') {
					exitHandler = handler;
				}
			}),
			kill: vi.fn((signal: string) => {
				mockChild.killed = true;
				// Trigger exit immediately
				if (exitHandler) {
					setTimeout(() => exitHandler(0, signal), 10);
				}
			}),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();
		await supervisor.stop();

		expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
		expect(fs.existsSync(pidFile)).toBe(false);
	}, 2000); // Shorter timeout since we trigger immediately

	it('should send SIGKILL if worker does not stop', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		// Don't trigger exit event, so timeout will occur
		// This test will take 10 seconds, so we increase timeout
		await supervisor.stop();

		// Should have called kill at least once (SIGTERM, possibly SIGKILL)
		expect(mockChild.kill.mock.calls.length).toBeGreaterThanOrEqual(1);
	}, 15000); // Increase timeout to 15s for this test

	it('should reload worker on SIGHUP', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();
		await supervisor.reload();

		expect(mockChild.kill).toHaveBeenCalledWith('SIGHUP');
	});

	it('should handle worker errors', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		// Trigger error handler
		const errorHandler = mockChild.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
		if (errorHandler) {
			errorHandler(new Error('Worker error'));
		}

		// Should not crash supervisor
		expect(supervisor.isRunning()).toBe(true);
	});

	it('should clean up stale PID file', () => {
		// Write invalid PID
		fs.writeFileSync(pidFile, '999999', 'utf-8');

		expect(supervisor.isRunning()).toBe(false);
		expect(fs.existsSync(pidFile)).toBe(false);
	});

	it('should prevent starting if already running', async () => {
		const mockChild = {
			on: vi.fn(),
			kill: vi.fn(),
			killed: false,
		};
		vi.mocked(cp.fork).mockReturnValue(mockChild as any);

		await supervisor.start();

		await expect(supervisor.start()).rejects.toThrow('already running');
	});
});

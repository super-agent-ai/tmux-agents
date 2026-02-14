// ─── Config Tests ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, validateConfig, ensureDirectories, DaemonConfig } from '../../daemon/config';

describe('Config', () => {
	let tempDir: string;
	let configPath: string;

	beforeEach(() => {
		// Create temp directory for test configs
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-config-test-'));
		configPath = path.join(tempDir, 'config.toml');
	});

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should load default config when file does not exist', () => {
		const config = loadConfig('/nonexistent/path/config.toml');
		expect(config).toBeDefined();
		expect(config.httpPort).toBe(3456);
		expect(config.logLevel).toBe('info');
		expect(config.runtimes).toHaveLength(1);
		expect(config.runtimes[0].type).toBe('local-tmux');
	});

	it('should parse TOML config file', () => {
		const tomlContent = `
httpPort = 4000
wsPort = 4001
logLevel = "debug"
enableAutoMonitor = false

[[runtimes]]
id = "local"
type = "local-tmux"

[[runtimes]]
id = "docker1"
type = "docker"
host = "unix:///var/run/docker.sock"
`;
		fs.writeFileSync(configPath, tomlContent, 'utf-8');

		const config = loadConfig(configPath);
		expect(config.httpPort).toBe(4000);
		expect(config.wsPort).toBe(4001);
		expect(config.logLevel).toBe('debug');
		expect(config.enableAutoMonitor).toBe(false);
		expect(config.runtimes).toHaveLength(2);
		expect(config.runtimes[1].id).toBe('docker1');
		expect(config.runtimes[1].type).toBe('docker');
	});

	it('should validate valid config', () => {
		const config = loadConfig();
		const errors = validateConfig(config);
		expect(errors).toHaveLength(0);
	});

	it('should detect invalid httpPort', () => {
		const config = loadConfig();
		config.httpPort = 99999;
		const errors = validateConfig(config);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('httpPort');
	});

	it('should detect invalid logLevel', () => {
		const config = loadConfig();
		(config as any).logLevel = 'invalid';
		const errors = validateConfig(config);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some(e => e.includes('logLevel'))).toBe(true);
	});

	it('should detect invalid runtime type', () => {
		const config = loadConfig();
		config.runtimes.push({ id: 'test', type: 'invalid' as any });
		const errors = validateConfig(config);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.some(e => e.includes('runtime type'))).toBe(true);
	});

	it('should ensure directories are created', () => {
		const config = loadConfig();
		config.dataDir = path.join(tempDir, 'data');
		config.logFile = path.join(tempDir, 'logs', 'daemon.log');
		config.pidFile = path.join(tempDir, 'run', 'daemon.pid');
		config.unixSocket = path.join(tempDir, 'sockets', 'daemon.sock');

		ensureDirectories(config);

		expect(fs.existsSync(config.dataDir)).toBe(true);
		expect(fs.existsSync(path.dirname(config.logFile))).toBe(true);
		expect(fs.existsSync(path.dirname(config.pidFile))).toBe(true);
		expect(fs.existsSync(path.dirname(config.unixSocket))).toBe(true);
	});
});

// ─── Config Loading & Validation ─────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface RuntimeConfig {
	id: string;
	type: 'local-tmux' | 'docker' | 'k8s' | 'ssh';
	[key: string]: any;
}

export interface DaemonConfig {
	// Server settings
	unixSocket: string;
	httpPort: number;
	wsPort: number;
	logLevel: 'debug' | 'info' | 'warn' | 'error';
	logFile: string;
	pidFile: string;
	dataDir: string;
	dbPath: string;

	// Daemon behavior
	enableAutoMonitor: boolean;
	autoMonitorInterval: number;
	reconcileOnStart: boolean;
	maxRestarts: number;
	restartWindow: number;
	backoffDelay: number;

	// Runtime configuration
	runtimes: RuntimeConfig[];

	// API settings
	enableCors: boolean;
	corsOrigins: string[];
	maxRequestSize: string;
	requestTimeout: number;
}

const DEFAULT_CONFIG: DaemonConfig = {
	unixSocket: path.join(os.homedir(), '.tmux-agents', 'daemon.sock'),
	httpPort: 3456,
	wsPort: 3457,
	logLevel: 'info',
	logFile: path.join(os.homedir(), '.tmux-agents', 'daemon.log'),
	pidFile: path.join(os.homedir(), '.tmux-agents', 'daemon.pid'),
	dataDir: path.join(os.homedir(), '.tmux-agents'),
	dbPath: path.join(os.homedir(), '.tmux-agents', 'data.db'),

	enableAutoMonitor: true,
	autoMonitorInterval: 5000,
	reconcileOnStart: true,
	maxRestarts: 5,
	restartWindow: 30000,
	backoffDelay: 60000,

	runtimes: [
		{ id: 'local', type: 'local-tmux' },
	],

	enableCors: true,
	corsOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
	maxRequestSize: '10mb',
	requestTimeout: 30000,
};

/**
 * Load daemon configuration from TOML file with defaults
 */
export function loadConfig(configPath?: string): DaemonConfig {
	const finalPath = configPath || path.join(os.homedir(), '.tmux-agents', 'config.toml');

	// If config file doesn't exist, return defaults
	if (!fs.existsSync(finalPath)) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		// Parse TOML (simple key=value parser for now, can upgrade to full TOML library)
		const content = fs.readFileSync(finalPath, 'utf-8');
		const parsed = parseTOML(content);

		// Merge with defaults
		return {
			...DEFAULT_CONFIG,
			...parsed,
			runtimes: parsed.runtimes || DEFAULT_CONFIG.runtimes,
		};
	} catch (error) {
		console.error('[Config] Failed to load config file:', error);
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Simple TOML parser (supports basic key=value, [sections], and arrays)
 */
function parseTOML(content: string): Partial<DaemonConfig> {
	const result: any = {};
	let currentSection: any = result;
	let currentArrayKey: string | null = null;
	let currentArray: any[] = [];

	const lines = content.split('\n');
	for (let line of lines) {
		line = line.trim();

		// Skip empty lines and comments
		if (!line || line.startsWith('#')) {
			continue;
		}

		// Section header [section] or [[array]]
		if (line.startsWith('[') && line.endsWith(']')) {
			// Check if it's an array section [[...]]
			if (line.startsWith('[[') && line.endsWith(']]')) {
				// Handle [[array]] syntax
				const arrayKey = line.slice(2, -2).trim();

				// If we're switching to a new array, save the old one
				if (currentArrayKey && currentArrayKey !== arrayKey) {
					result[currentArrayKey] = currentArray;
					currentArray = [];
				}

				// Initialize array if needed
				if (!currentArrayKey || currentArrayKey !== arrayKey) {
					currentArrayKey = arrayKey;
					if (!result[arrayKey]) {
						result[arrayKey] = [];
						currentArray = result[arrayKey];
					} else {
						currentArray = result[arrayKey];
					}
				}

				// Add new object to array
				const newObj = {};
				currentArray.push(newObj);
				currentSection = newObj;
			} else {
				// Regular section [section]
				// Save previous array if any
				if (currentArrayKey) {
					// Array already saved in result
					currentArrayKey = null;
					currentArray = [];
				}

				const sectionName = line.slice(1, -1).trim();
				result[sectionName] = {};
				currentSection = result[sectionName];
			}
			continue;
		}

		// Key-value pair
		const eqIndex = line.indexOf('=');
		if (eqIndex === -1) {
			continue;
		}

		const key = line.slice(0, eqIndex).trim();
		let value: any = line.slice(eqIndex + 1).trim();

		// Parse value type
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1); // String
		} else if (value.startsWith('[') && value.endsWith(']')) {
			// Array
			const items = value.slice(1, -1).split(',').map((s: string) => {
				s = s.trim();
				if (s.startsWith('"') && s.endsWith('"')) {
					return s.slice(1, -1);
				}
				return parseValue(s);
			});
			value = items;
		} else {
			value = parseValue(value);
		}

		currentSection[key] = value;
	}

	// No need to save final array as it's already in result

	return result;
}

function parseValue(val: string): any {
	if (val === 'true') {
		return true;
	}
	if (val === 'false') {
		return false;
	}
	if (/^-?\d+$/.test(val)) {
		return parseInt(val, 10);
	}
	if (/^-?\d+\.\d+$/.test(val)) {
		return parseFloat(val);
	}
	return val;
}

/**
 * Validate configuration
 */
export function validateConfig(config: DaemonConfig): string[] {
	const errors: string[] = [];

	if (config.httpPort < 1 || config.httpPort > 65535) {
		errors.push('httpPort must be between 1 and 65535');
	}

	if (config.wsPort < 1 || config.wsPort > 65535) {
		errors.push('wsPort must be between 1 and 65535');
	}

	if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
		errors.push('logLevel must be one of: debug, info, warn, error');
	}

	if (config.maxRestarts < 0) {
		errors.push('maxRestarts must be >= 0');
	}

	if (config.restartWindow < 1000) {
		errors.push('restartWindow must be >= 1000ms');
	}

	// Validate runtimes
	for (const runtime of config.runtimes) {
		if (!runtime.id) {
			errors.push('Runtime missing required field: id');
		}
		if (!['local-tmux', 'docker', 'k8s', 'ssh'].includes(runtime.type)) {
			errors.push(`Invalid runtime type: ${runtime.type}`);
		}
	}

	return errors;
}

/**
 * Ensure required directories exist
 */
export function ensureDirectories(config: DaemonConfig): void {
	const dirs = [
		config.dataDir,
		path.dirname(config.logFile),
		path.dirname(config.pidFile),
		path.dirname(config.unixSocket),
	];

	for (const dir of dirs) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}
}

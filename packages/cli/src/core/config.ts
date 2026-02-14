// ─── Config ────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Configuration for an AI provider (CLI tool)
 */
export interface ProviderConfig {
	command: string;
	pipeCommand?: string;
	args?: string[];
	forkArgs?: string[];
	autoPilotFlags?: string[];
	resumeFlag?: string;
	env?: Record<string, string>;
	defaultWorkingDirectory?: string;
	shell?: string;
}

/**
 * Configuration for a runtime (execution backend)
 */
export interface RuntimeConfig {
	type: 'local' | 'ssh' | 'docker' | 'kubernetes';
	id: string;

	// SSH-specific
	host?: string;
	user?: string;
	port?: number;

	// Docker-specific
	image?: string;
	memory?: string;
	cpus?: number;
	network?: string;

	// Kubernetes-specific
	namespace?: string;
	context?: string;
	kubeconfig?: string;
}

/**
 * Main configuration interface
 */
export interface ConfigData {
	runtimes?: Record<string, RuntimeConfig>;
	providers?: Record<string, ProviderConfig>;
	defaultProvider?: string;
	defaultRuntime?: string;
	database?: {
		path?: string;
	};
	daemon?: {
		unixSocket?: string;
		httpPort?: number;
		wsPort?: number;
		logFile?: string;
		logLevel?: 'debug' | 'info' | 'warn' | 'error';
	};
	[key: string]: any;
}

/**
 * Config - Replaces vscode.workspace.getConfiguration()
 * Reads from TOML/JSON config file or environment variables
 */
export class Config {
	private data: ConfigData;
	private configPath: string;

	constructor(data: ConfigData = {}, configPath?: string) {
		this.data = data;
		this.configPath = configPath || Config.getDefaultConfigPath();
	}

	/**
	 * Load config from file
	 * @param configPath Path to config file (TOML or JSON)
	 * @returns Config instance
	 */
	static load(configPath?: string): Config {
		const actualPath = configPath || Config.getDefaultConfigPath();

		if (!fs.existsSync(actualPath)) {
			// Return default config if file doesn't exist
			return new Config(Config.getDefaults(), actualPath);
		}

		try {
			const content = fs.readFileSync(actualPath, 'utf-8');

			// Detect format by extension
			if (actualPath.endsWith('.toml')) {
				// For now, use JSON. In production, add 'toml' package
				throw new Error('TOML parsing not yet implemented. Use .json config for now.');
			} else {
				// Parse as JSON
				const data = JSON.parse(content);
				return new Config(data, actualPath);
			}
		} catch (error) {
			console.error(`Failed to load config from ${actualPath}:`, error);
			return new Config(Config.getDefaults(), actualPath);
		}
	}

	/**
	 * Get default config path
	 */
	private static getDefaultConfigPath(): string {
		const home = os.homedir();
		const configDir = path.join(home, '.tmux-agents');

		// Create config dir if it doesn't exist
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		return path.join(configDir, 'config.json');
	}

	/**
	 * Get default configuration values
	 */
	private static getDefaults(): ConfigData {
		return {
			defaultProvider: 'claude',
			defaultRuntime: 'local',
			providers: {
				claude: {
					command: 'claude',
					pipeCommand: 'claude',
					args: ['--print', '--model', 'opus', '-'],
					autoPilotFlags: ['--autopilot'],
					resumeFlag: '--resume',
					env: {},
				},
			},
			runtimes: {
				local: {
					type: 'local',
					id: 'local',
				},
			},
			database: {
				path: path.join(os.homedir(), '.tmux-agents', 'data.db'),
			},
			daemon: {
				unixSocket: path.join(os.homedir(), '.tmux-agents', 'daemon.sock'),
				httpPort: 3456,
				wsPort: 3457,
				logFile: path.join(os.homedir(), '.tmux-agents', 'daemon.log'),
				logLevel: 'info',
			},
		};
	}

	/**
	 * Get a configuration value with optional fallback
	 * @param key Dot-separated key path (e.g., 'daemon.httpPort')
	 * @param fallback Fallback value if key doesn't exist
	 */
	get<T>(key: string, fallback?: T): T {
		const keys = key.split('.');
		let value: any = this.data;

		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = value[k];
			} else {
				return fallback as T;
			}
		}

		return value as T;
	}

	/**
	 * Set a configuration value
	 * @param key Dot-separated key path
	 * @param value Value to set
	 */
	set(key: string, value: any): void {
		const keys = key.split('.');
		let target: any = this.data;

		for (let i = 0; i < keys.length - 1; i++) {
			const k = keys[i];
			if (!(k in target) || typeof target[k] !== 'object') {
				target[k] = {};
			}
			target = target[k];
		}

		target[keys[keys.length - 1]] = value;
	}

	/**
	 * Get all provider configurations
	 */
	getProviders(): Record<string, ProviderConfig> {
		return this.get('providers', {});
	}

	/**
	 * Get a specific provider configuration
	 */
	getProvider(name: string): ProviderConfig | undefined {
		const providers = this.getProviders();
		return providers[name];
	}

	/**
	 * Get all runtime configurations
	 */
	getRuntimes(): Record<string, RuntimeConfig> {
		return this.get('runtimes', {});
	}

	/**
	 * Get a specific runtime configuration
	 */
	getRuntime(id: string): RuntimeConfig | undefined {
		const runtimes = this.getRuntimes();
		return runtimes[id];
	}

	/**
	 * Save config to file
	 */
	save(): void {
		try {
			const content = JSON.stringify(this.data, null, 2);
			fs.writeFileSync(this.configPath, content, 'utf-8');
		} catch (error) {
			console.error(`Failed to save config to ${this.configPath}:`, error);
			throw error;
		}
	}

	/**
	 * Get the entire config data (for debugging)
	 */
	getAll(): ConfigData {
		return { ...this.data };
	}
}

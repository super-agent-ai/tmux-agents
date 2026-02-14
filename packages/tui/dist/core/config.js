// ─── Config ────────────────────────────────────────────────────────────────
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
/**
 * Config - Replaces vscode.workspace.getConfiguration()
 * Reads from TOML/JSON config file or environment variables
 */
export class Config {
    constructor(data = {}, configPath) {
        this.data = data;
        this.configPath = configPath || Config.getDefaultConfigPath();
    }
    /**
     * Load config from file
     * @param configPath Path to config file (TOML or JSON)
     * @returns Config instance
     */
    static load(configPath) {
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
            }
            else {
                // Parse as JSON
                const data = JSON.parse(content);
                return new Config(data, actualPath);
            }
        }
        catch (error) {
            console.error(`Failed to load config from ${actualPath}:`, error);
            return new Config(Config.getDefaults(), actualPath);
        }
    }
    /**
     * Get default config path
     */
    static getDefaultConfigPath() {
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
    static getDefaults() {
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
                httpPort: 7331,
                wsPort: 7332,
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
    get(key, fallback) {
        const keys = key.split('.');
        let value = this.data;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            }
            else {
                return fallback;
            }
        }
        return value;
    }
    /**
     * Set a configuration value
     * @param key Dot-separated key path
     * @param value Value to set
     */
    set(key, value) {
        const keys = key.split('.');
        let target = this.data;
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
    getProviders() {
        return this.get('providers', {});
    }
    /**
     * Get a specific provider configuration
     */
    getProvider(name) {
        const providers = this.getProviders();
        return providers[name];
    }
    /**
     * Get all runtime configurations
     */
    getRuntimes() {
        return this.get('runtimes', {});
    }
    /**
     * Get a specific runtime configuration
     */
    getRuntime(id) {
        const runtimes = this.getRuntimes();
        return runtimes[id];
    }
    /**
     * Save config to file
     */
    save() {
        try {
            const content = JSON.stringify(this.data, null, 2);
            fs.writeFileSync(this.configPath, content, 'utf-8');
        }
        catch (error) {
            console.error(`Failed to save config to ${this.configPath}:`, error);
            throw error;
        }
    }
    /**
     * Get the entire config data (for debugging)
     */
    getAll() {
        return { ...this.data };
    }
}
//# sourceMappingURL=config.js.map
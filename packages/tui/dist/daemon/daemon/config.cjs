"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultConfig = getDefaultConfig;
exports.loadConfig = loadConfig;
exports.validateConfig = validateConfig;
exports.ensureDataDir = ensureDataDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// ─── Default Configuration ───────────────────────────────────────────────────
function getDefaultConfig() {
    const dataDir = path.join(os.homedir(), '.tmux-agents');
    return {
        dataDir,
        pidFile: path.join(dataDir, 'daemon.pid'),
        logFile: path.join(dataDir, 'daemon.log'),
        dbFile: path.join(dataDir, 'data.db'),
        socketPath: path.join(dataDir, 'daemon.sock'),
        httpPort: 7766,
        httpHost: '127.0.0.1',
        wsPort: 7767,
        enableUnixSocket: true,
        enableHttp: true,
        enableWebSocket: true,
        logLevel: 'info',
        logToStdout: false,
        maxLogFileSize: 50 * 1024 * 1024, // 50MB
        maxLogFiles: 5,
        healthCheckInterval: 30000, // 30s
        reconcileOnStart: true,
        maxRestarts: 5,
        restartWindow: 30000, // 30s
        restartBackoff: 60000, // 60s
        runtimes: [
            {
                id: 'local',
                type: 'local-tmux',
                enabled: true
            }
        ]
    };
}
// ─── TOML Parsing (simple key-value parser) ──────────────────────────────────
function parseSimpleTOML(content) {
    const result = {};
    let currentSection = result;
    let currentSectionName = '';
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        // Section headers: [section]
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSectionName = trimmed.slice(1, -1);
            currentSection = {};
            result[currentSectionName] = currentSection;
            continue;
        }
        // Key-value pairs: key = value
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Parse value type
        if (value === 'true') {
            value = true;
        }
        else if (value === 'false') {
            value = false;
        }
        else if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1); // String
        }
        else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1); // String
        }
        else if (!isNaN(Number(value))) {
            value = Number(value); // Number
        }
        currentSection[key] = value;
    }
    return result;
}
// ─── Load Configuration ──────────────────────────────────────────────────────
function loadConfig(configPath) {
    const defaults = getDefaultConfig();
    // If no config path provided, try default locations
    if (!configPath) {
        const defaultPath = path.join(defaults.dataDir, 'config.toml');
        if (fs.existsSync(defaultPath)) {
            configPath = defaultPath;
        }
        else {
            // No config file, return defaults
            return defaults;
        }
    }
    // Load and parse TOML config
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = parseSimpleTOML(content);
        // Merge with defaults
        const config = { ...defaults };
        // Apply daemon settings
        if (parsed.daemon) {
            Object.assign(config, parsed.daemon);
        }
        // Apply server settings
        if (parsed.server) {
            Object.assign(config, parsed.server);
        }
        // Apply logging settings
        if (parsed.logging) {
            Object.assign(config, parsed.logging);
        }
        // Apply supervisor settings
        if (parsed.supervisor) {
            Object.assign(config, parsed.supervisor);
        }
        // Apply runtimes (array of runtime configs)
        if (parsed.runtime) {
            config.runtimes = [];
            for (const [key, value] of Object.entries(parsed.runtime)) {
                if (typeof value === 'object') {
                    config.runtimes.push({ id: key, ...value });
                }
            }
        }
        return config;
    }
    catch (err) {
        throw new Error(`Failed to load config from ${configPath}: ${err}`);
    }
}
// ─── Validate Configuration ──────────────────────────────────────────────────
function validateConfig(config) {
    const errors = [];
    // Check required paths are absolute
    if (!path.isAbsolute(config.dataDir)) {
        errors.push('dataDir must be an absolute path');
    }
    // Check port ranges
    if (config.httpPort < 1024 || config.httpPort > 65535) {
        errors.push('httpPort must be between 1024 and 65535');
    }
    if (config.wsPort < 1024 || config.wsPort > 65535) {
        errors.push('wsPort must be between 1024 and 65535');
    }
    // Check at least one server is enabled
    if (!config.enableUnixSocket && !config.enableHttp && !config.enableWebSocket) {
        errors.push('At least one server must be enabled (Unix socket, HTTP, or WebSocket)');
    }
    // Check log level
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(config.logLevel)) {
        errors.push(`logLevel must be one of: ${validLevels.join(', ')}`);
    }
    // Check supervisor settings
    if (config.maxRestarts < 1) {
        errors.push('maxRestarts must be at least 1');
    }
    if (config.restartWindow < 1000) {
        errors.push('restartWindow must be at least 1000ms');
    }
    return errors;
}
// ─── Ensure Data Directory ───────────────────────────────────────────────────
function ensureDataDir(config) {
    if (!fs.existsSync(config.dataDir)) {
        fs.mkdirSync(config.dataDir, { recursive: true });
    }
}
//# sourceMappingURL=config.js.map
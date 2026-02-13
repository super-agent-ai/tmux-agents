"use strict";
// ─── Structured Logging ──────────────────────────────────────────────────────
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
exports.Logger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
/**
 * Logger - Structured JSON logging with rotation
 *
 * Features:
 * - JSON-structured log lines
 * - Log rotation (max 50MB per file, keep 5 files)
 * - Output to file + stdout (if foreground mode)
 */
class Logger {
    constructor(options) {
        this.maxFileSizeBytes = 50 * 1024 * 1024; // 50MB
        this.maxBackups = 5;
        this.level = options.level || 'info';
        this.logFile = options.logFile;
        this.foreground = options.foreground ?? false;
        // Ensure log directory exists
        if (this.logFile) {
            const dir = path.dirname(this.logFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }
    /**
     * Log a message at the specified level
     */
    log(level, component, msg, data) {
        if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
            return;
        }
        const entry = {
            ts: new Date().toISOString(),
            level,
            component,
            msg,
        };
        if (data !== undefined) {
            entry.data = data;
        }
        const line = JSON.stringify(entry);
        // Output to stdout if foreground
        if (this.foreground) {
            console.log(line);
        }
        // Output to file if configured
        if (this.logFile) {
            this.writeToFile(line);
        }
    }
    debug(component, msg, data) {
        this.log('debug', component, msg, data);
    }
    info(component, msg, data) {
        this.log('info', component, msg, data);
    }
    warn(component, msg, data) {
        this.log('warn', component, msg, data);
    }
    error(component, msg, data) {
        this.log('error', component, msg, data);
    }
    /**
     * Write log line to file with rotation
     */
    writeToFile(line) {
        if (!this.logFile) {
            return;
        }
        try {
            // Check file size and rotate if needed
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                if (stats.size >= this.maxFileSizeBytes) {
                    this.rotateLog();
                }
            }
            // Append to log file
            fs.appendFileSync(this.logFile, line + '\n', 'utf-8');
        }
        catch (error) {
            // Fallback to console if file write fails
            console.error('Failed to write to log file:', error);
            console.log(line);
        }
    }
    /**
     * Rotate log files (daemon.log → daemon.log.1 → daemon.log.2 → ...)
     */
    rotateLog() {
        if (!this.logFile) {
            return;
        }
        try {
            // Remove oldest backup
            const oldestBackup = `${this.logFile}.${this.maxBackups}`;
            if (fs.existsSync(oldestBackup)) {
                fs.unlinkSync(oldestBackup);
            }
            // Shift existing backups
            for (let i = this.maxBackups - 1; i >= 1; i--) {
                const oldPath = `${this.logFile}.${i}`;
                const newPath = `${this.logFile}.${i + 1}`;
                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                }
            }
            // Rotate current log to .1
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, `${this.logFile}.1`);
            }
        }
        catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }
    /**
     * Change log level at runtime
     */
    setLevel(level) {
        this.level = level;
        this.info('logger', `Log level changed to ${level}`);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=log.js.map
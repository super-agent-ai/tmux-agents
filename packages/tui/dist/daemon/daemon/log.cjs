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
exports.Logger = exports.LogLevel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ─── Log Levels ──────────────────────────────────────────────────────────────
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const LOG_LEVEL_PRIORITY = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3
};
// ─── Logger Class ────────────────────────────────────────────────────────────
class Logger {
    constructor(config) {
        this.config = {
            ...config,
            maxFileSize: config.maxFileSize ?? 50 * 1024 * 1024, // 50MB
            maxFiles: config.maxFiles ?? 5
        };
        this.initializeFileStream();
    }
    initializeFileStream() {
        // Ensure log directory exists
        const logDir = path.dirname(this.config.logFilePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        // Check if rotation is needed
        this.rotateIfNeeded();
        // Open log file for appending
        this.fileStream = fs.createWriteStream(this.config.logFilePath, { flags: 'a' });
    }
    rotateIfNeeded() {
        try {
            if (!fs.existsSync(this.config.logFilePath)) {
                return;
            }
            const stats = fs.statSync(this.config.logFilePath);
            if (stats.size < this.config.maxFileSize) {
                return;
            }
            // Rotate: daemon.log → daemon.1.log → daemon.2.log → ... → daemon.N.log
            for (let i = this.config.maxFiles - 1; i >= 1; i--) {
                const oldPath = `${this.config.logFilePath}.${i}`;
                const newPath = `${this.config.logFilePath}.${i + 1}`;
                if (fs.existsSync(oldPath)) {
                    if (i === this.config.maxFiles - 1) {
                        fs.unlinkSync(oldPath); // Delete oldest
                    }
                    else {
                        fs.renameSync(oldPath, newPath);
                    }
                }
            }
            // Move current log to .1
            fs.renameSync(this.config.logFilePath, `${this.config.logFilePath}.1`);
        }
        catch (err) {
            // Fail silently on rotation errors (log to stderr if stdout logging is off)
            if (!this.config.logToStdout) {
                console.error('Log rotation failed:', err);
            }
        }
    }
    shouldLog(level) {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
    }
    write(entry) {
        if (!this.shouldLog(entry.level)) {
            return;
        }
        const line = JSON.stringify(entry) + '\n';
        // Write to file
        if (this.fileStream) {
            this.fileStream.write(line);
        }
        // Write to stdout if enabled
        if (this.config.logToStdout) {
            process.stdout.write(line);
        }
    }
    debug(component, msg, data) {
        this.write({
            ts: new Date().toISOString(),
            level: LogLevel.DEBUG,
            component,
            msg,
            data
        });
    }
    info(component, msg, data) {
        this.write({
            ts: new Date().toISOString(),
            level: LogLevel.INFO,
            component,
            msg,
            data
        });
    }
    warn(component, msg, data) {
        this.write({
            ts: new Date().toISOString(),
            level: LogLevel.WARN,
            component,
            msg,
            data
        });
    }
    error(component, msg, data) {
        this.write({
            ts: new Date().toISOString(),
            level: LogLevel.ERROR,
            component,
            msg,
            data
        });
    }
    close() {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = undefined;
        }
    }
    // Force rotation check (can be called periodically or on SIGHUP)
    checkRotation() {
        this.rotateIfNeeded();
    }
}
exports.Logger = Logger;
//# sourceMappingURL=log.js.map
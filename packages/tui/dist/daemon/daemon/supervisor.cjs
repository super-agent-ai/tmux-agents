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
exports.Supervisor = void 0;
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const config_1 = require("./config.cjs");
// ─── Supervisor ──────────────────────────────────────────────────────────────
class Supervisor {
    constructor(configPath) {
        this.restartCount = 0;
        this.restartTimes = [];
        this.circuitBreakerActive = false;
        this.shuttingDown = false;
        this.config = (0, config_1.loadConfig)(configPath);
    }
    // Start the supervisor (daemon mode)
    async startDaemon() {
        console.log('Starting tmux-agents daemon...');
        // Check if daemon is already running
        if (this.isDaemonRunning()) {
            const pid = this.readPidFile();
            console.error(`Daemon is already running (PID: ${pid})`);
            process.exit(1);
        }
        // Daemonize: detach from terminal
        this.daemonize();
        // Start worker
        this.startWorker();
        // Write PID file
        this.writePidFile();
        console.log(`Daemon started (PID: ${process.pid})`);
    }
    // Start the supervisor (foreground mode for debugging)
    async startForeground() {
        console.log('Starting tmux-agents daemon in foreground mode...');
        // Write PID file
        this.writePidFile();
        // Start worker
        this.startWorker();
        console.log(`Daemon running in foreground (PID: ${process.pid})`);
    }
    // Stop the daemon
    async stop() {
        console.log('Stopping tmux-agents daemon...');
        const pid = this.readPidFile();
        if (!pid) {
            console.error('Daemon is not running (no PID file found)');
            process.exit(1);
        }
        try {
            // Send SIGTERM to daemon
            process.kill(pid, 'SIGTERM');
            console.log(`Sent SIGTERM to daemon (PID: ${pid})`);
            // Wait for daemon to exit (poll for PID file deletion)
            let attempts = 0;
            while (fs.existsSync(this.config.pidFile) && attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (fs.existsSync(this.config.pidFile)) {
                console.warn('Daemon did not exit gracefully, sending SIGKILL');
                process.kill(pid, 'SIGKILL');
                this.removePidFile();
            }
            console.log('Daemon stopped successfully');
        }
        catch (err) {
            if (err.code === 'ESRCH') {
                console.warn('Daemon process not found, cleaning up PID file');
                this.removePidFile();
            }
            else {
                console.error('Failed to stop daemon:', err);
                process.exit(1);
            }
        }
    }
    // Get daemon status
    async status() {
        const pid = this.readPidFile();
        if (!pid) {
            console.log('Daemon is not running (no PID file found)');
            process.exit(1);
        }
        try {
            // Check if process exists (send signal 0)
            process.kill(pid, 0);
            console.log(`Daemon is running (PID: ${pid})`);
            // Try to get health report via HTTP
            try {
                const http = require('http');
                const options = {
                    hostname: this.config.httpHost,
                    port: this.config.httpPort,
                    path: '/health',
                    method: 'GET',
                    timeout: 2000
                };
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const health = JSON.parse(data);
                            console.log('\nHealth Report:');
                            console.log(`  Status: ${health.status}`);
                            console.log(`  Uptime: ${health.uptime}s`);
                            console.log(`  Version: ${health.version}`);
                        }
                        catch (err) {
                            console.log('(Health check response parse failed)');
                        }
                    });
                });
                req.on('error', () => {
                    console.log('(Health check endpoint not responding)');
                });
                req.end();
            }
            catch (err) {
                // Ignore health check errors
            }
        }
        catch (err) {
            if (err.code === 'ESRCH') {
                console.log('Daemon is not running (PID file exists but process is dead)');
                console.log('Cleaning up stale PID file...');
                this.removePidFile();
                process.exit(1);
            }
            else {
                throw err;
            }
        }
    }
    // ─── Worker Management ───────────────────────────────────────────────────
    startWorker() {
        console.log('Forking worker process...');
        // Fork the worker (server.ts main entry)
        this.worker = (0, child_process_1.fork)(path.join(__dirname, 'worker.cjs'), [], {
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            detached: false
        });
        this.worker.on('exit', (code, signal) => {
            console.log(`Worker exited (code: ${code}, signal: ${signal})`);
            if (this.shuttingDown) {
                console.log('Shutdown in progress, not restarting worker');
                return;
            }
            // Check circuit breaker
            if (this.shouldRestart()) {
                console.log('Restarting worker...');
                this.startWorker();
            }
            else {
                console.error('Circuit breaker active: too many restarts, backing off');
                this.circuitBreakerActive = true;
                setTimeout(() => {
                    console.log('Circuit breaker reset, restarting worker');
                    this.circuitBreakerActive = false;
                    this.restartCount = 0;
                    this.restartTimes = [];
                    this.startWorker();
                }, this.config.restartBackoff);
            }
        });
        this.worker.on('error', (err) => {
            console.error('Worker error:', err);
        });
    }
    shouldRestart() {
        const now = Date.now();
        this.restartCount++;
        this.restartTimes.push(now);
        // Remove restart times outside the window
        this.restartTimes = this.restartTimes.filter(time => now - time < this.config.restartWindow);
        // Check if we've exceeded max restarts in the window
        if (this.restartTimes.length > this.config.maxRestarts) {
            return false; // Circuit breaker tripped
        }
        return true;
    }
    // ─── Daemonization ───────────────────────────────────────────────────────
    daemonize() {
        // Redirect stdio to log file
        const logFd = fs.openSync(this.config.logFile, 'a');
        // Don't close stdin, just ignore it
        const logStream = fs.createWriteStream('', { fd: logFd });
        process.stdout.write = logStream.write.bind(logStream);
        process.stderr.write = logStream.write.bind(logStream);
        // Change working directory to root (to avoid holding open user's cwd)
        try {
            process.chdir('/');
        }
        catch (err) {
            // Ignore chdir errors on platforms where it's not supported
        }
    }
    // ─── PID File Management ─────────────────────────────────────────────────
    writePidFile() {
        const pidDir = path.dirname(this.config.pidFile);
        if (!fs.existsSync(pidDir)) {
            fs.mkdirSync(pidDir, { recursive: true });
        }
        fs.writeFileSync(this.config.pidFile, String(process.pid));
    }
    readPidFile() {
        try {
            if (!fs.existsSync(this.config.pidFile)) {
                return null;
            }
            const pidStr = fs.readFileSync(this.config.pidFile, 'utf-8').trim();
            return parseInt(pidStr, 10);
        }
        catch (err) {
            return null;
        }
    }
    removePidFile() {
        try {
            if (fs.existsSync(this.config.pidFile)) {
                fs.unlinkSync(this.config.pidFile);
            }
        }
        catch (err) {
            console.error('Failed to remove PID file:', err);
        }
    }
    isDaemonRunning() {
        const pid = this.readPidFile();
        if (!pid) {
            return false;
        }
        try {
            // Check if process exists (send signal 0)
            process.kill(pid, 0);
            return true;
        }
        catch (err) {
            if (err.code === 'ESRCH') {
                // Process not found, clean up stale PID file
                this.removePidFile();
                return false;
            }
            throw err;
        }
    }
    // ─── Signal Handlers ─────────────────────────────────────────────────────
    setupSignalHandlers() {
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down...');
            this.gracefulShutdown();
        });
        process.on('SIGINT', () => {
            console.log('Received SIGINT, shutting down...');
            this.gracefulShutdown();
        });
        process.on('SIGHUP', () => {
            console.log('Received SIGHUP, reloading configuration...');
            this.reloadConfig();
        });
    }
    gracefulShutdown() {
        this.shuttingDown = true;
        // Send SIGTERM to worker
        if (this.worker) {
            this.worker.kill('SIGTERM');
            // Wait for worker to exit
            setTimeout(() => {
                if (this.worker && !this.worker.killed) {
                    console.log('Worker did not exit gracefully, sending SIGKILL');
                    this.worker.kill('SIGKILL');
                }
                this.cleanup();
            }, 5000);
        }
        else {
            this.cleanup();
        }
    }
    cleanup() {
        this.removePidFile();
        process.exit(0);
    }
    reloadConfig() {
        try {
            this.config = (0, config_1.loadConfig)();
            console.log('Configuration reloaded successfully');
            // Forward SIGHUP to worker if it exists
            if (this.worker) {
                this.worker.kill('SIGHUP');
            }
        }
        catch (err) {
            console.error('Failed to reload configuration:', err);
        }
    }
}
exports.Supervisor = Supervisor;
// ─── CLI Entry Point ─────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined;
    const supervisor = new Supervisor(configPath);
    switch (command) {
        case 'start':
            supervisor.setupSignalHandlers();
            await supervisor.startDaemon();
            break;
        case 'run':
            supervisor.setupSignalHandlers();
            await supervisor.startForeground();
            break;
        case 'stop':
            await supervisor.stop();
            break;
        case 'status':
            await supervisor.status();
            break;
        default:
            console.error('Usage: tmux-agents daemon <start|run|stop|status> [--config <path>]');
            process.exit(1);
    }
}
// Run if executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=supervisor.js.map
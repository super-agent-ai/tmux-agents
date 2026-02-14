"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthChecker = void 0;
// ─── Health Checker ──────────────────────────────────────────────────────────
class HealthChecker {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.startTime = Date.now();
    }
    // Check database health
    async checkDatabase(db) {
        try {
            // Simple query to verify database is accessible
            await new Promise((resolve, reject) => {
                db.run('SELECT 1', (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            return {
                status: 'healthy',
                message: 'Database is accessible',
                lastCheck: new Date().toISOString()
            };
        }
        catch (err) {
            this.logger.error('health', 'Database health check failed', { error: err });
            return {
                status: 'unhealthy',
                message: `Database error: ${err}`,
                lastCheck: new Date().toISOString()
            };
        }
    }
    // Check runtime health (tmux/docker/k8s availability)
    async checkRuntime(runtime) {
        try {
            switch (runtime.type) {
                case 'local-tmux':
                    return await this.checkLocalTmux(runtime);
                case 'docker':
                    return await this.checkDocker(runtime);
                case 'k8s':
                    return await this.checkKubernetes(runtime);
                case 'ssh':
                    return await this.checkSsh(runtime);
                default:
                    return {
                        status: 'degraded',
                        message: `Unknown runtime type: ${runtime.type}`,
                        lastCheck: new Date().toISOString()
                    };
            }
        }
        catch (err) {
            this.logger.error('health', `Runtime ${runtime.id} health check failed`, { error: err });
            return {
                status: 'unhealthy',
                message: `Runtime check error: ${err}`,
                lastCheck: new Date().toISOString()
            };
        }
    }
    async checkLocalTmux(runtime) {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            exec('tmux -V', (err, stdout) => {
                if (err) {
                    resolve({
                        status: 'unhealthy',
                        message: 'tmux not available',
                        lastCheck: new Date().toISOString(),
                        details: { error: err.message }
                    });
                }
                else {
                    resolve({
                        status: 'healthy',
                        message: 'tmux is available',
                        lastCheck: new Date().toISOString(),
                        details: { version: stdout.trim() }
                    });
                }
            });
        });
    }
    async checkDocker(runtime) {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            exec('docker version --format json', (err, stdout) => {
                if (err) {
                    resolve({
                        status: 'unhealthy',
                        message: 'Docker not available',
                        lastCheck: new Date().toISOString(),
                        details: { error: err.message }
                    });
                }
                else {
                    try {
                        const version = JSON.parse(stdout);
                        resolve({
                            status: 'healthy',
                            message: 'Docker is available',
                            lastCheck: new Date().toISOString(),
                            details: { version: version.Server?.Version }
                        });
                    }
                    catch (parseErr) {
                        resolve({
                            status: 'degraded',
                            message: 'Docker available but version parse failed',
                            lastCheck: new Date().toISOString()
                        });
                    }
                }
            });
        });
    }
    async checkKubernetes(runtime) {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            exec('kubectl version --client --output=json', (err, stdout) => {
                if (err) {
                    resolve({
                        status: 'unhealthy',
                        message: 'kubectl not available',
                        lastCheck: new Date().toISOString(),
                        details: { error: err.message }
                    });
                }
                else {
                    resolve({
                        status: 'healthy',
                        message: 'kubectl is available',
                        lastCheck: new Date().toISOString()
                    });
                }
            });
        });
    }
    async checkSsh(runtime) {
        const { exec } = require('child_process');
        const host = runtime.host || 'unknown';
        return new Promise((resolve) => {
            exec(`ssh -o ConnectTimeout=5 -o BatchMode=yes ${host} echo ok`, (err) => {
                if (err) {
                    resolve({
                        status: 'unhealthy',
                        message: `SSH connection to ${host} failed`,
                        lastCheck: new Date().toISOString(),
                        details: { error: err.message }
                    });
                }
                else {
                    resolve({
                        status: 'healthy',
                        message: `SSH connection to ${host} successful`,
                        lastCheck: new Date().toISOString()
                    });
                }
            });
        });
    }
    // Check server health (Unix socket, HTTP, WebSocket)
    checkServer(type, listening, error) {
        if (listening) {
            return {
                status: 'healthy',
                message: `${type} server is listening`,
                lastCheck: new Date().toISOString()
            };
        }
        else {
            return {
                status: 'unhealthy',
                message: error || `${type} server is not listening`,
                lastCheck: new Date().toISOString()
            };
        }
    }
    // Generate full health report
    async generateReport(db, serverStatus) {
        const dbHealth = await this.checkDatabase(db);
        const runtimesHealth = {};
        for (const runtime of this.config.runtimes) {
            if (runtime.enabled !== false) {
                runtimesHealth[runtime.id] = await this.checkRuntime(runtime);
            }
        }
        const serversHealth = {};
        if (this.config.enableUnixSocket) {
            serversHealth.unixSocket = this.checkServer('unixSocket', serverStatus.unixSocket ?? false);
        }
        if (this.config.enableHttp) {
            serversHealth.http = this.checkServer('http', serverStatus.http ?? false);
        }
        if (this.config.enableWebSocket) {
            serversHealth.webSocket = this.checkServer('webSocket', serverStatus.webSocket ?? false);
        }
        // Determine overall status
        let overallStatus = 'healthy';
        if (dbHealth.status === 'unhealthy') {
            overallStatus = 'unhealthy';
        }
        const runtimeStatuses = Object.values(runtimesHealth).map(r => r.status);
        const serverStatuses = Object.values(serversHealth).map((r) => r.status);
        if (runtimeStatuses.includes('unhealthy') || serverStatuses.includes('unhealthy')) {
            overallStatus = 'unhealthy';
        }
        else if (runtimeStatuses.includes('degraded') || serverStatuses.includes('degraded')) {
            overallStatus = 'degraded';
        }
        return {
            status: overallStatus,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            version: require('../../package.json').version || '0.0.0',
            pid: process.pid,
            timestamp: new Date().toISOString(),
            components: {
                database: dbHealth,
                runtimes: runtimesHealth,
                servers: serversHealth
            }
        };
    }
}
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=health.js.map
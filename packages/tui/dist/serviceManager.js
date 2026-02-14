import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { TmuxService } from './tmuxService';
export class TmuxServiceManager {
    constructor() {
        this.services = new Map();
        this.scriptServers = [];
        this.scriptRunning = false;
        this._onConfigChanged = new vscode.EventEmitter();
        this.onConfigChanged = this._onConfigChanged.event;
        this._onServicesChanged = new vscode.EventEmitter();
        this.onServicesChanged = this._onServicesChanged.event;
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('tmuxAgents.sshServers') ||
                e.affectsConfiguration('tmuxAgents.showLocalSessions') ||
                e.affectsConfiguration('tmuxManager.sshServers') ||
                e.affectsConfiguration('tmuxManager.showLocalSessions')) {
                this.rebuildServices();
                this._onServicesChanged.fire();
            }
            if (e.affectsConfiguration('tmuxAgents.sshServersScript')) {
                this.restartScriptDaemon();
            }
            if (e.affectsConfiguration('tmuxAgents') ||
                e.affectsConfiguration('tmuxManager')) {
                this._onConfigChanged.fire(e);
            }
        });
        this.rebuildServices();
        this.restartScriptDaemon();
    }
    // ── Path helpers ─────────────────────────────────────────────────────────
    expandPath(p) {
        if (p.startsWith('~/') || p === '~') {
            return path.join(os.homedir(), p.slice(1));
        }
        return p;
    }
    // ── Async script execution (non-blocking) ────────────────────────────────
    loadServersFromScriptAsync(scriptPath, timeoutSec) {
        if (!scriptPath) {
            return Promise.resolve([]);
        }
        const resolved = this.expandPath(scriptPath.trim());
        const timeoutMs = timeoutSec * 1000;
        return new Promise((resolve) => {
            let stdout = '';
            let settled = false;
            const proc = cp.spawn(resolved, [], {
                shell: '/bin/sh',
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    proc.kill();
                    console.warn(`sshServersScript timed out after ${timeoutSec}s`);
                    resolve([]);
                }
            }, timeoutMs);
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => {
                const msg = d.toString().trim();
                if (msg) {
                    console.warn(`sshServersScript stderr: ${msg}`);
                }
            });
            proc.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    console.warn(`sshServersScript spawn error: ${err}`);
                    resolve([]);
                }
            });
            proc.on('close', (code) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                if (code !== 0) {
                    console.warn(`sshServersScript exited with code ${code}`);
                    resolve([]);
                    return;
                }
                try {
                    const parsed = JSON.parse(stdout.trim());
                    if (!Array.isArray(parsed)) {
                        console.warn(`sshServersScript: expected JSON array, got ${typeof parsed}`);
                        resolve([]);
                        return;
                    }
                    resolve(parsed.filter((s) => s && typeof s.host === 'string'));
                }
                catch (err) {
                    console.warn(`sshServersScript JSON parse error: ${err}`);
                    resolve([]);
                }
            });
        });
    }
    // ── Script daemon ────────────────────────────────────────────────────────
    restartScriptDaemon() {
        // Stop existing timer
        if (this.scriptTimer) {
            clearInterval(this.scriptTimer);
            this.scriptTimer = undefined;
        }
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const sshCfg = config.get('sshServers') || {};
        const scriptCfg = sshCfg.script || {};
        const scriptPath = scriptCfg.path || '';
        if (!scriptPath) {
            // No script configured — clear any previous script servers
            if (this.scriptServers.length > 0) {
                this.scriptServers = [];
                this.rebuildServices();
                this._onServicesChanged.fire();
            }
            return;
        }
        const intervalSec = Math.max(10, scriptCfg.interval ?? 300);
        const timeoutSec = Math.max(1, Math.min(60, scriptCfg.timeout ?? 10));
        // Run immediately, then on interval
        this.runScriptOnce(scriptPath, timeoutSec);
        this.scriptTimer = setInterval(() => {
            this.runScriptOnce(scriptPath, timeoutSec);
        }, intervalSec * 1000);
    }
    async runScriptOnce(scriptPath, timeoutSec) {
        if (this.scriptRunning) {
            return;
        } // skip if previous run still in-flight
        this.scriptRunning = true;
        try {
            const servers = await this.loadServersFromScriptAsync(scriptPath, timeoutSec);
            // Only rebuild if the result actually changed
            const changed = JSON.stringify(servers) !== JSON.stringify(this.scriptServers);
            if (changed) {
                this.scriptServers = servers;
                this.rebuildServices();
                this._onServicesChanged.fire();
            }
        }
        finally {
            this.scriptRunning = false;
        }
    }
    // ── Service building ─────────────────────────────────────────────────────
    addSshServers(servers) {
        for (const sshConfig of servers) {
            if (sshConfig.enabled === false) {
                continue;
            }
            if (!sshConfig.host) {
                continue;
            }
            const id = `remote:${sshConfig.label || sshConfig.host}`;
            if (this.services.has(id)) {
                continue;
            } // earlier entries take precedence
            const server = {
                id,
                label: sshConfig.label || sshConfig.host,
                isLocal: false,
                sshConfig
            };
            this.services.set(id, new TmuxService(server));
        }
    }
    rebuildServices() {
        this.services.clear();
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const oldConfig = vscode.workspace.getConfiguration('tmuxManager');
        // Local server
        const showLocal = config.get('showLocalSessions') ?? oldConfig.get('showLocalSessions', true);
        if (showLocal) {
            const localServer = {
                id: 'local',
                label: 'Local',
                isLocal: true
            };
            this.services.set('local', new TmuxService(localServer));
        }
        // Static SSH servers
        const sshCfg = config.get('sshServers') || {};
        let sshServers = sshCfg.servers || [];
        // Fallback: old flat array format or old tmuxManager key
        if (sshServers.length === 0 && Array.isArray(sshCfg)) {
            sshServers = sshCfg;
        }
        if (sshServers.length === 0) {
            sshServers = oldConfig.get('sshServers', []);
        }
        this.addSshServers(sshServers);
        // Script-sourced SSH servers (merged, static takes precedence)
        if (this.scriptServers.length > 0) {
            this.addSshServers(this.scriptServers);
        }
    }
    // ── Public API ───────────────────────────────────────────────────────────
    getDaemonRefreshConfig() {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const dr = config.get('daemonRefresh') || {};
        return {
            lightIntervalMs: dr.lightInterval ?? 10000,
            fullIntervalMs: dr.fullInterval ?? 60000,
            enabled: dr.enabled ?? true
        };
    }
    getPaneCaptureConfig() {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const pc = config.get('paneCapture') || {};
        return {
            lines: pc.lines ?? 50,
            enabled: pc.enabled ?? true
        };
    }
    getAllServices() {
        return Array.from(this.services.values());
    }
    getService(serverId) {
        return this.services.get(serverId);
    }
    hasRemoteServers() {
        return Array.from(this.services.values()).some(s => s.serverId !== 'local');
    }
    dispose() {
        if (this.scriptTimer) {
            clearInterval(this.scriptTimer);
        }
        this.configChangeDisposable.dispose();
        this._onConfigChanged.dispose();
        this._onServicesChanged.dispose();
    }
}
//# sourceMappingURL=serviceManager.js.map
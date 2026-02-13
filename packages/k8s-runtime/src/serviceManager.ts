import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { TmuxService } from './tmuxService';
import { DaemonRefreshConfig, PaneCaptureConfig, ServerIdentity, SshServerConfig } from './types';

export class TmuxServiceManager implements vscode.Disposable {
    private services: Map<string, TmuxService> = new Map();
    private configChangeDisposable: vscode.Disposable;
    private scriptTimer: ReturnType<typeof setInterval> | undefined;
    private scriptServers: SshServerConfig[] = [];
    private scriptRunning = false;

    private _onConfigChanged = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
    public readonly onConfigChanged: vscode.Event<vscode.ConfigurationChangeEvent> = this._onConfigChanged.event;

    private _onServicesChanged = new vscode.EventEmitter<void>();
    public readonly onServicesChanged: vscode.Event<void> = this._onServicesChanged.event;

    constructor() {
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

    private expandPath(p: string): string {
        if (p.startsWith('~/') || p === '~') {
            return path.join(os.homedir(), p.slice(1));
        }
        return p;
    }

    // ── Async script execution (non-blocking) ────────────────────────────────

    private loadServersFromScriptAsync(scriptPath: string, timeoutSec: number): Promise<SshServerConfig[]> {
        if (!scriptPath) { return Promise.resolve([]); }
        const resolved = this.expandPath(scriptPath.trim());
        const timeoutMs = timeoutSec * 1000;

        return new Promise<SshServerConfig[]>((resolve) => {
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

            proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
            proc.stderr!.on('data', (d: Buffer) => {
                const msg = d.toString().trim();
                if (msg) { console.warn(`sshServersScript stderr: ${msg}`); }
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
                if (settled) { return; }
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
                    resolve(parsed.filter((s: any) => s && typeof s.host === 'string'));
                } catch (err) {
                    console.warn(`sshServersScript JSON parse error: ${err}`);
                    resolve([]);
                }
            });
        });
    }

    // ── Script daemon ────────────────────────────────────────────────────────

    private restartScriptDaemon(): void {
        // Stop existing timer
        if (this.scriptTimer) {
            clearInterval(this.scriptTimer);
            this.scriptTimer = undefined;
        }

        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const sshCfg = config.get<any>('sshServers') || {};
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

    private async runScriptOnce(scriptPath: string, timeoutSec: number): Promise<void> {
        if (this.scriptRunning) { return; } // skip if previous run still in-flight
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
        } finally {
            this.scriptRunning = false;
        }
    }

    // ── Service building ─────────────────────────────────────────────────────

    private addSshServers(servers: SshServerConfig[]): void {
        for (const sshConfig of servers) {
            if (sshConfig.enabled === false) { continue; }
            if (!sshConfig.host) { continue; }
            const id = `remote:${sshConfig.label || sshConfig.host}`;
            if (this.services.has(id)) { continue; } // earlier entries take precedence
            const server: ServerIdentity = {
                id,
                label: sshConfig.label || sshConfig.host,
                isLocal: false,
                sshConfig
            };
            this.services.set(id, new TmuxService(server));
        }
    }

    private rebuildServices(): void {
        this.services.clear();

        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const oldConfig = vscode.workspace.getConfiguration('tmuxManager');

        // Local server
        const showLocal = config.get<boolean>('showLocalSessions') ?? oldConfig.get<boolean>('showLocalSessions', true);
        if (showLocal) {
            const localServer: ServerIdentity = {
                id: 'local',
                label: 'Local',
                isLocal: true
            };
            this.services.set('local', new TmuxService(localServer));
        }

        // Static SSH servers
        const sshCfg = config.get<any>('sshServers') || {};
        let sshServers: SshServerConfig[] = sshCfg.servers || [];
        // Fallback: old flat array format or old tmuxManager key
        if (sshServers.length === 0 && Array.isArray(sshCfg)) {
            sshServers = sshCfg;
        }
        if (sshServers.length === 0) {
            sshServers = oldConfig.get<SshServerConfig[]>('sshServers', []);
        }
        this.addSshServers(sshServers);

        // Script-sourced SSH servers (merged, static takes precedence)
        if (this.scriptServers.length > 0) {
            this.addSshServers(this.scriptServers);
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    public getDaemonRefreshConfig(): DaemonRefreshConfig {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const dr = config.get<any>('daemonRefresh') || {};
        return {
            lightIntervalMs: dr.lightInterval ?? 10000,
            fullIntervalMs: dr.fullInterval ?? 60000,
            enabled: dr.enabled ?? true
        };
    }

    public getPaneCaptureConfig(): PaneCaptureConfig {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const pc = config.get<any>('paneCapture') || {};
        return {
            lines: pc.lines ?? 50,
            enabled: pc.enabled ?? true
        };
    }

    public getAllServices(): TmuxService[] {
        return Array.from(this.services.values());
    }

    public getService(serverId: string): TmuxService | undefined {
        return this.services.get(serverId);
    }

    public hasRemoteServers(): boolean {
        return Array.from(this.services.values()).some(s => s.serverId !== 'local');
    }

    public dispose(): void {
        if (this.scriptTimer) { clearInterval(this.scriptTimer); }
        this.configChangeDisposable.dispose();
        this._onConfigChanged.dispose();
        this._onServicesChanged.dispose();
    }
}

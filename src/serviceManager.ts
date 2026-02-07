import * as vscode from 'vscode';
import { TmuxService } from './tmuxService';
import { DaemonRefreshConfig, PaneCaptureConfig, ServerIdentity, SshServerConfig } from './types';

export class TmuxServiceManager implements vscode.Disposable {
    private services: Map<string, TmuxService> = new Map();
    private configChangeDisposable: vscode.Disposable;

    private _onConfigChanged = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
    public readonly onConfigChanged: vscode.Event<vscode.ConfigurationChangeEvent> = this._onConfigChanged.event;

    constructor() {
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('tmuxAgents.sshServers') ||
                e.affectsConfiguration('tmuxAgents.showLocalSessions') ||
                e.affectsConfiguration('tmuxManager.sshServers') ||
                e.affectsConfiguration('tmuxManager.showLocalSessions')) {
                this.rebuildServices();
            }
            if (e.affectsConfiguration('tmuxAgents') ||
                e.affectsConfiguration('tmuxManager')) {
                this._onConfigChanged.fire(e);
            }
        });
        this.rebuildServices();
    }

    private rebuildServices(): void {
        this.services.clear();

        const config = vscode.workspace.getConfiguration('tmuxAgents');
        const oldConfig = vscode.workspace.getConfiguration('tmuxManager');

        // Local server (check new key, fallback to old key)
        const showLocal = config.get<boolean>('showLocalSessions') ?? oldConfig.get<boolean>('showLocalSessions', true);
        if (showLocal) {
            const localServer: ServerIdentity = {
                id: 'local',
                label: 'Local',
                isLocal: true
            };
            this.services.set('local', new TmuxService(localServer));
        }

        // SSH remote servers (check new key, fallback to old key)
        let sshServers = config.get<SshServerConfig[]>('sshServers', []);
        if (sshServers.length === 0) {
            sshServers = oldConfig.get<SshServerConfig[]>('sshServers', []);
        }
        for (const sshConfig of sshServers) {
            if (sshConfig.enabled === false) {
                continue;
            }
            if (!sshConfig.host) {
                continue;
            }
            const id = `remote:${sshConfig.label || sshConfig.host}`;
            const server: ServerIdentity = {
                id,
                label: sshConfig.label || sshConfig.host,
                isLocal: false,
                sshConfig
            };
            this.services.set(id, new TmuxService(server));
        }
    }

    public getDaemonRefreshConfig(): DaemonRefreshConfig {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        return {
            lightIntervalMs: config.get<number>('daemonRefresh.lightInterval', 10000),
            fullIntervalMs: config.get<number>('daemonRefresh.fullInterval', 60000),
            enabled: config.get<boolean>('daemonRefresh.enabled', true)
        };
    }

    public getPaneCaptureConfig(): PaneCaptureConfig {
        const config = vscode.workspace.getConfiguration('tmuxAgents');
        return {
            lines: config.get<number>('paneCapture.lines', 50),
            enabled: config.get<boolean>('paneCapture.enabled', true)
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
        this.configChangeDisposable.dispose();
        this._onConfigChanged.dispose();
    }
}

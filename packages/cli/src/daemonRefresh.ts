import * as vscode from 'vscode';
import { DaemonRefreshConfig, TreeSnapshot, TmuxSession } from './core/types';

const DEFAULT_CONFIG: DaemonRefreshConfig = {
    lightIntervalMs: 10000,
    fullIntervalMs: 60000,
    enabled: true
};

export class DaemonRefreshService implements vscode.Disposable {
    private config: DaemonRefreshConfig;
    private lightTimer: ReturnType<typeof setInterval> | undefined;
    private fullTimer: ReturnType<typeof setInterval> | undefined;
    private lastSnapshot: TreeSnapshot | undefined;
    private onRefreshNeeded: () => void;

    public onLightRefresh: (() => void) | undefined;
    public onFullRefresh: (() => void) | undefined;

    constructor(onRefreshNeeded: () => void, config?: DaemonRefreshConfig) {
        this.onRefreshNeeded = onRefreshNeeded;
        this.config = config ?? { ...DEFAULT_CONFIG };
    }

    computeHash(sessions: TmuxSession[]): string {
        let parts: string[] = [];
        for (const session of sessions) {
            parts.push(session.name);
            parts.push(String(session.windows.length));
            for (const window of session.windows) {
                for (const pane of window.panes) {
                    parts.push(pane.command);
                    parts.push(String(pane.pid));
                }
            }
        }
        return parts.join('|');
    }

    hasChanged(sessions: TmuxSession[]): boolean {
        const currentHash = this.computeHash(sessions);
        if (!this.lastSnapshot) {
            return true;
        }
        return currentHash !== this.lastSnapshot.hash;
    }

    updateSnapshot(sessions: TmuxSession[]): void {
        this.lastSnapshot = {
            hash: this.computeHash(sessions),
            timestamp: Date.now(),
            sessionCount: sessions.length
        };
    }

    start(): void {
        this.stop();
        if (!this.config.enabled) {
            return;
        }

        this.lightTimer = setInterval(() => {
            this.onLightRefresh?.();
        }, this.config.lightIntervalMs);

        this.fullTimer = setInterval(() => {
            this.onFullRefresh?.();
        }, this.config.fullIntervalMs);
    }

    stop(): void {
        if (this.lightTimer !== undefined) {
            clearInterval(this.lightTimer);
            this.lightTimer = undefined;
        }
        if (this.fullTimer !== undefined) {
            clearInterval(this.fullTimer);
            this.fullTimer = undefined;
        }
    }

    forceRefresh(): void {
        this.onRefreshNeeded();
    }

    setConfig(config: Partial<DaemonRefreshConfig>): void {
        this.config = { ...this.config, ...config };
        this.stop();
        this.start();
    }

    dispose(): void {
        this.stop();
    }
}

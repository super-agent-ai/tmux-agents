const DEFAULT_CONFIG = {
    lightIntervalMs: 10000,
    fullIntervalMs: 60000,
    enabled: true
};
export class DaemonRefreshService {
    constructor(onRefreshNeeded, config) {
        this.onRefreshNeeded = onRefreshNeeded;
        this.config = config ?? { ...DEFAULT_CONFIG };
    }
    computeHash(sessions) {
        let parts = [];
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
    hasChanged(sessions) {
        const currentHash = this.computeHash(sessions);
        if (!this.lastSnapshot) {
            return true;
        }
        return currentHash !== this.lastSnapshot.hash;
    }
    updateSnapshot(sessions) {
        this.lastSnapshot = {
            hash: this.computeHash(sessions),
            timestamp: Date.now(),
            sessionCount: sessions.length
        };
    }
    start() {
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
    stop() {
        if (this.lightTimer !== undefined) {
            clearInterval(this.lightTimer);
            this.lightTimer = undefined;
        }
        if (this.fullTimer !== undefined) {
            clearInterval(this.fullTimer);
            this.fullTimer = undefined;
        }
    }
    forceRefresh() {
        this.onRefreshNeeded();
    }
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.stop();
        this.start();
    }
    dispose() {
        this.stop();
    }
}
//# sourceMappingURL=daemonRefresh.js.map
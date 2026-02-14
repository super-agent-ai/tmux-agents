export interface RuntimeConfig {
    id: string;
    type: 'local-tmux' | 'docker' | 'k8s' | 'ssh';
    enabled?: boolean;
    [key: string]: any;
}
export interface DaemonConfig {
    dataDir: string;
    pidFile: string;
    logFile: string;
    dbFile: string;
    socketPath: string;
    httpPort: number;
    httpHost: string;
    wsPort: number;
    enableUnixSocket: boolean;
    enableHttp: boolean;
    enableWebSocket: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logToStdout: boolean;
    maxLogFileSize: number;
    maxLogFiles: number;
    healthCheckInterval: number;
    reconcileOnStart: boolean;
    maxRestarts: number;
    restartWindow: number;
    restartBackoff: number;
    runtimes: RuntimeConfig[];
}
export declare function getDefaultConfig(): DaemonConfig;
export declare function loadConfig(configPath?: string): DaemonConfig;
export declare function validateConfig(config: DaemonConfig): string[];
export declare function ensureDataDir(config: DaemonConfig): void;

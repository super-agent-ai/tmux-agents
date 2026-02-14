export declare class Supervisor {
    private config;
    private worker?;
    private restartCount;
    private restartTimes;
    private circuitBreakerActive;
    private shuttingDown;
    constructor(configPath?: string);
    startDaemon(): Promise<void>;
    startForeground(): Promise<void>;
    stop(): Promise<void>;
    status(): Promise<void>;
    private startWorker;
    private shouldRestart;
    private daemonize;
    private writePidFile;
    private readPidFile;
    private removePidFile;
    private isDaemonRunning;
    setupSignalHandlers(): void;
    private gracefulShutdown;
    private cleanup;
    private reloadConfig;
}
export declare function main(): Promise<void>;

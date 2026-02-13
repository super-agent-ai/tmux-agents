import { DaemonClientOptions, ConnectionInfo, EventHandler, HealthReport, DaemonStats } from './types';
export declare class DaemonClient {
    private socketPath;
    private httpUrl;
    private wsUrl;
    private timeout;
    private autoReconnect;
    private maxReconnectAttempts;
    private reconnectDelay;
    private preferUnixSocket;
    private connectionType;
    private state;
    private reconnectAttempts;
    private wsClient;
    private requestId;
    constructor(options?: DaemonClientOptions);
    connect(): Promise<void>;
    private testUnixSocket;
    private testHttp;
    private connectWebSocket;
    call(method: string, params?: any): Promise<any>;
    private callUnixSocket;
    private callHttp;
    subscribe(handler: EventHandler): () => void;
    isRunning(): Promise<boolean>;
    disconnect(): void;
    getConnectionInfo(): ConnectionInfo;
    getHealth(): Promise<HealthReport>;
    getStats(): Promise<DaemonStats>;
}
//# sourceMappingURL=daemonClient.d.ts.map
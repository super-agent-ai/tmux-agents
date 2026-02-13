export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: any;
}
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: any;
    error?: JsonRpcError;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}
export interface DaemonEvent {
    event: string;
    data: any;
    timestamp: number;
}
export type EventHandler = (event: string, data: any) => void;
export declare enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    FAILED = "failed"
}
export interface DaemonClientOptions {
    socketPath?: string;
    httpUrl?: string;
    wsUrl?: string;
    timeout?: number;
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectDelay?: number;
    preferUnixSocket?: boolean;
}
export interface ConnectionInfo {
    state: ConnectionState;
    type: 'unix-socket' | 'http' | 'none';
    socketPath?: string;
    httpUrl?: string;
    wsConnected: boolean;
    reconnectAttempts: number;
}
export interface HealthReport {
    ok: boolean;
    uptime: number;
    version: string;
    runtimes: Array<{
        id: string;
        type: string;
        ok: boolean;
        latency?: number;
    }>;
    database: {
        ok: boolean;
        path: string;
    };
}
export interface DaemonStats {
    agents: {
        total: number;
        active: number;
        idle: number;
        error: number;
    };
    tasks: {
        total: number;
        pending: number;
        running: number;
        completed: number;
        failed: number;
    };
    pipelines: {
        total: number;
        active: number;
    };
}
//# sourceMappingURL=types.d.ts.map
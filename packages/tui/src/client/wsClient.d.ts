import { EventHandler, ConnectionState } from './types';
export declare class WsClient {
    private ws;
    private url;
    private handlers;
    private state;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private autoReconnect;
    private reconnectTimer;
    constructor(url: string, options?: {
        autoReconnect?: boolean;
        maxReconnectAttempts?: number;
        reconnectDelay?: number;
    });
    connect(): Promise<void>;
    private scheduleReconnect;
    subscribe(handler: EventHandler): () => void;
    disconnect(): void;
    getState(): ConnectionState;
    isConnected(): boolean;
}
//# sourceMappingURL=wsClient.d.ts.map
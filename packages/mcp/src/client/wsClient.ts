import WebSocket from 'ws';
import { EventHandler, DaemonEvent, ConnectionState } from './types.js';

// ─── WebSocket Client ──────────────────────────────────────────────────────

export class WsClient {
    private ws: WebSocket | null = null;
    private url: string;
    private handlers: EventHandler[] = [];
    private state: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts = 0;
    private maxReconnectAttempts: number;
    private reconnectDelay: number;
    private autoReconnect: boolean;
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(url: string, options: {
        autoReconnect?: boolean;
        maxReconnectAttempts?: number;
        reconnectDelay?: number;
    } = {}) {
        this.url = url;
        this.autoReconnect = options.autoReconnect !== false;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelay = options.reconnectDelay || 1000;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.state === ConnectionState.CONNECTED) {
                resolve();
                return;
            }

            this.state = ConnectionState.CONNECTING;

            this.ws = new WebSocket(this.url);

            this.ws.on('open', () => {
                this.state = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0;
                resolve();
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const event: DaemonEvent = JSON.parse(data.toString());
                    this.handlers.forEach(handler => {
                        handler(event.event, event.data);
                    });
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                if (this.state === ConnectionState.CONNECTING) {
                    reject(error);
                }
            });

            this.ws.on('close', () => {
                const wasConnected = this.state === ConnectionState.CONNECTED;
                this.state = ConnectionState.DISCONNECTED;
                this.ws = null;

                if (wasConnected && this.autoReconnect) {
                    this.scheduleReconnect();
                }
            });
        });
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.state = ConnectionState.FAILED;
            return;
        }

        this.state = ConnectionState.RECONNECTING;
        this.reconnectAttempts++;

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(e => {
                console.error('Reconnect failed:', e);
            });
        }, delay);
    }

    subscribe(handler: EventHandler): () => void {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.autoReconnect = false;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.state = ConnectionState.DISCONNECTED;
        this.reconnectAttempts = 0;
    }

    getState(): ConnectionState {
        return this.state;
    }

    isConnected(): boolean {
        return this.state === ConnectionState.CONNECTED;
    }
}

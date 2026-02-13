import WebSocket from 'ws';
import { ConnectionState } from './types';
// ─── WebSocket Client ──────────────────────────────────────────────────────
export class WsClient {
    ws = null;
    url;
    handlers = [];
    state = ConnectionState.DISCONNECTED;
    reconnectAttempts = 0;
    maxReconnectAttempts;
    reconnectDelay;
    autoReconnect;
    reconnectTimer = null;
    constructor(url, options = {}) {
        this.url = url;
        this.autoReconnect = options.autoReconnect !== false;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelay = options.reconnectDelay || 1000;
    }
    async connect() {
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
            this.ws.on('message', (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    this.handlers.forEach(handler => {
                        handler(event.event, event.data);
                    });
                }
                catch (e) {
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
    scheduleReconnect() {
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
    subscribe(handler) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }
    disconnect() {
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
    getState() {
        return this.state;
    }
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }
}
//# sourceMappingURL=wsClient.js.map
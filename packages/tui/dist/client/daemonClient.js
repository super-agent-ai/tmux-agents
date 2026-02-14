import * as http from 'http';
import * as net from 'net';
import { WsClient } from './wsClient.js';
import { getSocketPath, isDaemonRunning } from './discovery.js';
import { ConnectionState } from './types.js';
// ─── Daemon Client ─────────────────────────────────────────────────────────
export class DaemonClient {
    constructor(options = {}) {
        this.connectionType = 'none';
        this.state = ConnectionState.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.wsClient = null;
        this.requestId = 0;
        this.socketPath = options.socketPath || getSocketPath();
        this.httpUrl = options.httpUrl || 'http://localhost:3456';
        this.wsUrl = options.wsUrl || 'ws://localhost:3457';
        this.timeout = options.timeout || 30000;
        this.autoReconnect = options.autoReconnect !== false;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 2000;
        this.preferUnixSocket = options.preferUnixSocket !== false;
    }
    async connect() {
        this.state = ConnectionState.CONNECTING;
        // Try Unix socket first if preferred
        if (this.preferUnixSocket) {
            try {
                await this.testUnixSocket();
                this.connectionType = 'unix-socket';
                this.state = ConnectionState.CONNECTED;
                await this.connectWebSocket();
                return;
            }
            catch (e) {
                // Fall through to HTTP
            }
        }
        // Try HTTP
        try {
            await this.testHttp();
            this.connectionType = 'http';
            this.state = ConnectionState.CONNECTED;
            await this.connectWebSocket();
            return;
        }
        catch (e) {
            this.state = ConnectionState.FAILED;
            throw new Error('Failed to connect to daemon via Unix socket or HTTP');
        }
    }
    async testUnixSocket() {
        return new Promise((resolve, reject) => {
            const socket = net.connect(this.socketPath);
            socket.on('connect', () => {
                socket.end();
                resolve();
            });
            socket.on('error', (err) => {
                reject(err);
            });
            setTimeout(() => {
                socket.destroy();
                reject(new Error('Unix socket connection timeout'));
            }, 5000);
        });
    }
    async testHttp() {
        return new Promise((resolve, reject) => {
            const req = http.get(`${this.httpUrl}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                }
                else {
                    reject(new Error(`HTTP health check failed: ${res.statusCode}`));
                }
            });
            req.on('error', reject);
            setTimeout(() => {
                req.destroy();
                reject(new Error('HTTP connection timeout'));
            }, 5000);
        });
    }
    async connectWebSocket() {
        if (this.wsClient) {
            return;
        }
        try {
            this.wsClient = new WsClient(this.wsUrl, {
                autoReconnect: this.autoReconnect,
                maxReconnectAttempts: this.maxReconnectAttempts,
                reconnectDelay: this.reconnectDelay
            });
            await this.wsClient.connect();
        }
        catch (e) {
            console.warn('WebSocket connection failed (events will not be available):', e);
        }
    }
    async call(method, params) {
        if (this.state === ConnectionState.DISCONNECTED) {
            await this.connect();
        }
        const request = {
            jsonrpc: '2.0',
            id: ++this.requestId,
            method,
            params
        };
        const responseData = this.connectionType === 'unix-socket'
            ? await this.callUnixSocket(request)
            : await this.callHttp(request);
        const response = JSON.parse(responseData);
        if (response.error) {
            throw new Error(`RPC Error: ${response.error.message}`);
        }
        return response.result;
    }
    async callUnixSocket(request) {
        return new Promise((resolve, reject) => {
            const socket = net.connect(this.socketPath);
            let data = '';
            socket.on('connect', () => {
                socket.write(JSON.stringify(request) + '\n');
            });
            socket.on('data', (chunk) => {
                data += chunk.toString();
            });
            socket.on('end', () => {
                resolve(data);
            });
            socket.on('error', reject);
            setTimeout(() => {
                socket.destroy();
                reject(new Error('Unix socket request timeout'));
            }, this.timeout);
        });
    }
    async callHttp(request) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(request);
            const req = http.request(`${this.httpUrl}/rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk.toString();
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data);
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
            setTimeout(() => {
                req.destroy();
                reject(new Error('HTTP request timeout'));
            }, this.timeout);
        });
    }
    subscribe(handler) {
        if (!this.wsClient) {
            throw new Error('WebSocket not connected - call connect() first');
        }
        return this.wsClient.subscribe(handler);
    }
    async isRunning() {
        return await isDaemonRunning();
    }
    disconnect() {
        if (this.wsClient) {
            this.wsClient.disconnect();
            this.wsClient = null;
        }
        this.state = ConnectionState.DISCONNECTED;
        this.connectionType = 'none';
        this.reconnectAttempts = 0;
    }
    getConnectionInfo() {
        return {
            state: this.state,
            type: this.connectionType,
            socketPath: this.connectionType === 'unix-socket' ? this.socketPath : undefined,
            httpUrl: this.connectionType === 'http' ? this.httpUrl : undefined,
            wsConnected: this.wsClient?.isConnected() || false,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    // ─── Convenience Methods ───────────────────────────────────────────────
    async getHealth() {
        return await this.call('daemon.health');
    }
    async getStats() {
        return await this.call('daemon.stats');
    }
}
//# sourceMappingURL=daemonClient.js.map
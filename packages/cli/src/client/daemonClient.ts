import * as net from 'net';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { JsonRpcRequest, JsonRpcResponse, DaemonClientOptions, ConnectionInfo, ConnectionState } from './types';

export class DaemonClient {
    private socketPath: string;
    private httpUrl: string;
    private timeout: number;
    private socket: net.Socket | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, {
        resolve: (result: any) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
    }>();
    private buffer = '';
    private state: ConnectionState = ConnectionState.DISCONNECTED;

    constructor(options: DaemonClientOptions = {}) {
        this.socketPath = options.socketPath || path.join(os.homedir(), '.tmux-agents', 'daemon.sock');
        this.httpUrl = options.httpUrl || 'http://127.0.0.1:3737';
        this.timeout = options.timeout || 30000;
    }

    async connect(): Promise<void> {
        this.state = ConnectionState.CONNECTING;

        try {
            // Try Unix socket first
            await this.connectSocket();
            this.state = ConnectionState.CONNECTED;
        } catch (socketError) {
            // Fallback to HTTP
            this.state = ConnectionState.CONNECTED;
        }
    }

    private async connectSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = net.connect(this.socketPath);

            this.socket.on('connect', () => {
                resolve();
            });

            this.socket.on('data', (data) => {
                this.buffer += data.toString();
                this.processBuffer();
            });

            this.socket.on('error', (err) => {
                reject(err);
            });

            this.socket.on('close', () => {
                this.state = ConnectionState.DISCONNECTED;
                this.socket = null;
            });
        });
    }

    private processBuffer(): void {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const response: JsonRpcResponse = JSON.parse(line);
                const pending = this.pendingRequests.get(response.id as number);

                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingRequests.delete(response.id as number);

                    if (response.error) {
                        pending.reject(new Error(response.error.message));
                    } else {
                        pending.resolve(response.result);
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }
        }
    }

    async call(method: string, params?: any): Promise<any> {
        if (this.state === ConnectionState.DISCONNECTED) {
            await this.connect();
        }

        const id = ++this.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        if (this.socket && this.socket.writable) {
            return this.callViaSocket(request);
        } else {
            return this.callViaHttp(request);
        }
    }

    private async callViaSocket(request: JsonRpcRequest): Promise<any> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(request.id as number);
                reject(new Error(`Request timeout: ${request.method}`));
            }, this.timeout);

            this.pendingRequests.set(request.id as number, { resolve, reject, timer });

            const data = JSON.stringify(request) + '\n';
            this.socket!.write(data);
        });
    }

    private async callViaHttp(request: JsonRpcRequest): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL('/rpc', this.httpUrl);
            const data = JSON.stringify(request);

            const req = http.request({
                method: 'POST',
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: this.timeout
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const response: JsonRpcResponse = JSON.parse(body);
                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response.result);
                        }
                    } catch (err) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout: ${request.method}`));
            });

            req.write(data);
            req.end();
        });
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Client disconnected'));
        }
        this.pendingRequests.clear();
        this.state = ConnectionState.DISCONNECTED;
    }

    getConnectionInfo(): ConnectionInfo {
        return {
            state: this.state,
            type: this.socket ? 'unix-socket' : 'http',
            socketPath: this.socketPath,
            httpUrl: this.httpUrl,
            wsConnected: false,
            reconnectAttempts: 0
        };
    }

    // Helper methods
    async isRunning(): Promise<boolean> {
        try {
            await this.call('daemon.health');
            return true;
        } catch {
            return false;
        }
    }

    async health() {
        return this.call('daemon.health');
    }

    async stats() {
        return this.call('daemon.stats');
    }

    async shutdown() {
        return this.call('daemon.shutdown');
    }
}

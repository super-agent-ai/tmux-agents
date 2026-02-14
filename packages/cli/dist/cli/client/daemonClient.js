"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaemonClient = void 0;
const net = __importStar(require("net"));
const http = __importStar(require("http"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const types_1 = require("./types");
class DaemonClient {
    constructor(options = {}) {
        this.socket = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.buffer = '';
        this.state = types_1.ConnectionState.DISCONNECTED;
        this.socketPath = options.socketPath || path.join(os.homedir(), '.tmux-agents', 'daemon.sock');
        this.httpUrl = options.httpUrl || 'http://127.0.0.1:3456';
        this.timeout = options.timeout || 30000;
    }
    async connect() {
        this.state = types_1.ConnectionState.CONNECTING;
        try {
            // Try Unix socket first
            await this.connectSocket();
            this.state = types_1.ConnectionState.CONNECTED;
        }
        catch (socketError) {
            // Fallback to HTTP
            this.state = types_1.ConnectionState.CONNECTED;
        }
    }
    async connectSocket() {
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
                this.state = types_1.ConnectionState.DISCONNECTED;
                this.socket = null;
            });
        });
    }
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const response = JSON.parse(line);
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingRequests.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message));
                    }
                    else {
                        pending.resolve(response.result);
                    }
                }
            }
            catch (err) {
                // Ignore parse errors
            }
        }
    }
    async call(method, params) {
        if (this.state === types_1.ConnectionState.DISCONNECTED) {
            await this.connect();
        }
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };
        if (this.socket && this.socket.writable) {
            return this.callViaSocket(request);
        }
        else {
            return this.callViaHttp(request);
        }
    }
    async callViaSocket(request) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(request.id);
                reject(new Error(`Request timeout: ${request.method}`));
            }, this.timeout);
            this.pendingRequests.set(request.id, { resolve, reject, timer });
            const data = JSON.stringify(request) + '\n';
            this.socket.write(data);
        });
    }
    async callViaHttp(request) {
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
                        const response = JSON.parse(body);
                        if (response.error) {
                            reject(new Error(response.error.message));
                        }
                        else {
                            resolve(response.result);
                        }
                    }
                    catch (err) {
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
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Client disconnected'));
        }
        this.pendingRequests.clear();
        this.state = types_1.ConnectionState.DISCONNECTED;
    }
    getConnectionInfo() {
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
    async isRunning() {
        try {
            await this.call('daemon.health');
            return true;
        }
        catch {
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
exports.DaemonClient = DaemonClient;
//# sourceMappingURL=daemonClient.js.map
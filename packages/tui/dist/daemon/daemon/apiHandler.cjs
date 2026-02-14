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
exports.ApiHandler = void 0;
const net = __importStar(require("net"));
const http = __importStar(require("http"));
const WebSocket = __importStar(require("ws"));
const fs = __importStar(require("fs"));
const rpcRouter_1 = require("./rpcRouter.cjs");
// ─── API Handler ─────────────────────────────────────────────────────────────
class ApiHandler {
    constructor(config, logger, router, eventBus) {
        this.unixSocketListening = false;
        this.httpListening = false;
        this.wsListening = false;
        this.config = config;
        this.logger = logger;
        this.router = router;
        this.eventBus = eventBus;
    }
    // Start all enabled API servers
    async start() {
        const promises = [];
        if (this.config.enableUnixSocket) {
            promises.push(this.startUnixSocket());
        }
        if (this.config.enableHttp) {
            promises.push(this.startHttp());
        }
        if (this.config.enableWebSocket) {
            promises.push(this.startWebSocket());
        }
        await Promise.all(promises);
        this.logger.info('apiHandler', 'All API servers started');
    }
    // Stop all API servers
    async stop() {
        const promises = [];
        if (this.unixServer) {
            promises.push(this.stopUnixSocket());
        }
        if (this.httpServer) {
            promises.push(this.stopHttp());
        }
        if (this.wsServer) {
            promises.push(this.stopWebSocket());
        }
        await Promise.all(promises);
        this.logger.info('apiHandler', 'All API servers stopped');
    }
    // ─── Unix Socket Server ──────────────────────────────────────────────────
    async startUnixSocket() {
        return new Promise((resolve, reject) => {
            // Remove existing socket file if it exists
            if (fs.existsSync(this.config.socketPath)) {
                fs.unlinkSync(this.config.socketPath);
            }
            this.unixServer = net.createServer((socket) => {
                this.handleUnixConnection(socket);
            });
            this.unixServer.on('error', (err) => {
                this.logger.error('apiHandler', 'Unix socket server error', { error: err });
                this.unixSocketListening = false;
                reject(err);
            });
            this.unixServer.listen(this.config.socketPath, () => {
                this.unixSocketListening = true;
                this.logger.info('apiHandler', `Unix socket server listening`, { path: this.config.socketPath });
                resolve();
            });
        });
    }
    async stopUnixSocket() {
        return new Promise((resolve) => {
            if (!this.unixServer) {
                resolve();
                return;
            }
            this.unixServer.close(() => {
                this.unixSocketListening = false;
                // Clean up socket file
                if (fs.existsSync(this.config.socketPath)) {
                    fs.unlinkSync(this.config.socketPath);
                }
                this.logger.info('apiHandler', 'Unix socket server stopped');
                resolve();
            });
        });
    }
    handleUnixConnection(socket) {
        this.logger.debug('apiHandler', 'Unix socket client connected');
        let buffer = '';
        socket.on('data', async (data) => {
            buffer += data.toString();
            // Process newline-delimited JSON-RPC requests
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (!line)
                    continue;
                try {
                    const request = JSON.parse(line);
                    const response = await this.router.handleRequest(request);
                    socket.write(JSON.stringify(response) + '\n');
                }
                catch (err) {
                    const errorResponse = {
                        jsonrpc: '2.0',
                        id: null,
                        error: {
                            code: rpcRouter_1.RPC_ERRORS.PARSE_ERROR.code,
                            message: `Parse error: ${err}`
                        }
                    };
                    socket.write(JSON.stringify(errorResponse) + '\n');
                }
            }
        });
        socket.on('error', (err) => {
            this.logger.error('apiHandler', 'Unix socket client error', { error: err });
        });
        socket.on('close', () => {
            this.logger.debug('apiHandler', 'Unix socket client disconnected');
        });
    }
    // ─── HTTP Server ─────────────────────────────────────────────────────────
    async startHttp() {
        return new Promise((resolve, reject) => {
            this.httpServer = http.createServer((req, res) => {
                this.handleHttpRequest(req, res);
            });
            this.httpServer.on('error', (err) => {
                this.logger.error('apiHandler', 'HTTP server error', { error: err });
                this.httpListening = false;
                reject(err);
            });
            this.httpServer.listen(this.config.httpPort, this.config.httpHost, () => {
                this.httpListening = true;
                this.logger.info('apiHandler', `HTTP server listening`, {
                    host: this.config.httpHost,
                    port: this.config.httpPort
                });
                resolve();
            });
        });
    }
    async stopHttp() {
        return new Promise((resolve) => {
            if (!this.httpServer) {
                resolve();
                return;
            }
            this.httpServer.close(() => {
                this.httpListening = false;
                this.logger.info('apiHandler', 'HTTP server stopped');
                resolve();
            });
        });
    }
    async handleHttpRequest(req, res) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        // Health check endpoint
        if (req.method === 'GET' && req.url === '/health') {
            try {
                const health = await this.router.handleRequest({
                    jsonrpc: '2.0',
                    method: 'daemon.health',
                    params: {},
                    id: 1
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(health.result));
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(err) }));
            }
            return;
        }
        // SSE event stream endpoint
        if (req.method === 'GET' && req.url === '/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            const clientId = this.eventBus.registerSSEClient(res);
            this.logger.debug('apiHandler', 'SSE client connected', { clientId });
            req.on('close', () => {
                this.logger.debug('apiHandler', 'SSE client disconnected', { clientId });
            });
            return;
        }
        // JSON-RPC endpoint
        if (req.method === 'POST' && req.url === '/rpc') {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', async () => {
                try {
                    const request = JSON.parse(body);
                    const response = await this.router.handleRequest(request);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response));
                }
                catch (err) {
                    const errorResponse = {
                        jsonrpc: '2.0',
                        id: null,
                        error: {
                            code: rpcRouter_1.RPC_ERRORS.PARSE_ERROR.code,
                            message: `Parse error: ${err}`
                        }
                    };
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(errorResponse));
                }
            });
            return;
        }
        // 404 for unknown routes
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
    // ─── WebSocket Server ────────────────────────────────────────────────────
    async startWebSocket() {
        return new Promise((resolve, reject) => {
            this.wsServer = new WebSocket.Server({
                port: this.config.wsPort,
                host: this.config.httpHost
            });
            this.wsServer.on('error', (err) => {
                this.logger.error('apiHandler', 'WebSocket server error', { error: err });
                this.wsListening = false;
                reject(err);
            });
            this.wsServer.on('listening', () => {
                this.wsListening = true;
                this.logger.info('apiHandler', `WebSocket server listening`, {
                    host: this.config.httpHost,
                    port: this.config.wsPort
                });
                resolve();
            });
            this.wsServer.on('connection', (ws) => {
                this.handleWebSocketConnection(ws);
            });
        });
    }
    async stopWebSocket() {
        return new Promise((resolve) => {
            if (!this.wsServer) {
                resolve();
                return;
            }
            this.wsServer.close(() => {
                this.wsListening = false;
                this.logger.info('apiHandler', 'WebSocket server stopped');
                resolve();
            });
        });
    }
    handleWebSocketConnection(ws) {
        this.logger.debug('apiHandler', 'WebSocket client connected');
        // Register for event broadcasting
        this.eventBus.registerWebSocketClient(ws);
        // Handle incoming RPC messages
        ws.on('message', async (data) => {
            try {
                const request = JSON.parse(data.toString());
                const response = await this.router.handleRequest(request);
                ws.send(JSON.stringify(response));
            }
            catch (err) {
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: rpcRouter_1.RPC_ERRORS.PARSE_ERROR.code,
                        message: `Parse error: ${err}`
                    }
                };
                ws.send(JSON.stringify(errorResponse));
            }
        });
        ws.on('error', (err) => {
            this.logger.error('apiHandler', 'WebSocket client error', { error: err });
        });
        ws.on('close', () => {
            this.logger.debug('apiHandler', 'WebSocket client disconnected');
        });
    }
}
exports.ApiHandler = ApiHandler;
//# sourceMappingURL=apiHandler.js.map
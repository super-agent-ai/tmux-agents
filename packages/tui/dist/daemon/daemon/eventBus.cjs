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
exports.DaemonEventBus = void 0;
// Re-export core EventBus with additional WebSocket broadcasting functionality
const eventBus_1 = require("../core/eventBus.cjs");
const WebSocket = __importStar(require("ws"));
// ─── Daemon Event Bus ────────────────────────────────────────────────────────
class DaemonEventBus extends eventBus_1.EventBus {
    constructor(logger) {
        super();
        this.wsClients = new Set();
        this.sseClients = new Set();
        this.nextSseId = 1;
        this.logger = logger;
    }
    // Register a WebSocket client for event broadcasting
    registerWebSocketClient(ws) {
        this.wsClients.add(ws);
        this.logger?.debug('eventBus', 'WebSocket client registered', { totalClients: this.wsClients.size });
        ws.on('close', () => {
            this.wsClients.delete(ws);
            this.logger?.debug('eventBus', 'WebSocket client disconnected', { totalClients: this.wsClients.size });
        });
        ws.on('error', (err) => {
            this.logger?.error('eventBus', 'WebSocket client error', { error: err });
            this.wsClients.delete(ws);
        });
    }
    // Register a Server-Sent Events (SSE) client
    registerSSEClient(res) {
        const id = this.nextSseId++;
        this.sseClients.add({ res, id });
        this.logger?.debug('eventBus', 'SSE client registered', { id, totalClients: this.sseClients.size });
        res.on('close', () => {
            this.sseClients.delete({ res, id });
            this.logger?.debug('eventBus', 'SSE client disconnected', { id, totalClients: this.sseClients.size });
        });
        return id;
    }
    // Override emit to broadcast to WebSocket and SSE clients
    emit(event, data) {
        super.emit(event, data);
        const message = JSON.stringify({ event, data, timestamp: Date.now() });
        // Broadcast to WebSocket clients
        for (const ws of this.wsClients) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(message);
                }
                catch (err) {
                    this.logger?.error('eventBus', 'Failed to send to WebSocket client', { error: err });
                    this.wsClients.delete(ws);
                }
            }
        }
        // Broadcast to SSE clients
        for (const client of this.sseClients) {
            try {
                client.res.write(`data: ${message}\n\n`);
            }
            catch (err) {
                this.logger?.error('eventBus', 'Failed to send to SSE client', { error: err, id: client.id });
                this.sseClients.delete(client);
            }
        }
    }
    // Clean up all clients
    closeAllClients() {
        for (const ws of this.wsClients) {
            try {
                ws.close();
            }
            catch (err) {
                // Ignore errors on close
            }
        }
        this.wsClients.clear();
        for (const client of this.sseClients) {
            try {
                client.res.end();
            }
            catch (err) {
                // Ignore errors on close
            }
        }
        this.sseClients.clear();
    }
}
exports.DaemonEventBus = DaemonEventBus;
//# sourceMappingURL=eventBus.js.map
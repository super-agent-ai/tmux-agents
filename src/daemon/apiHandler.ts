// ─── API Handler (HTTP, WebSocket, Unix Socket) ─────────────────────────────

import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';
import { RpcRouter, JsonRpcRequest, JsonRpcResponse } from './rpcRouter';
import { EventBus } from '../core/eventBus';
import { Logger } from './log';
import { DaemonConfig } from './config';

/**
 * ApiHandler - Manages all API endpoints
 * - Unix socket (newline-delimited JSON-RPC)
 * - HTTP POST /rpc (JSON-RPC)
 * - HTTP GET /health (health check)
 * - HTTP GET /events (Server-Sent Events)
 * - WebSocket /ws (bidirectional JSON-RPC + event push)
 */
export class ApiHandler {
	private httpServer?: http.Server;
	private unixServer?: net.Server;
	private wsClients: Set<any> = new Set();
	private eventUnsubscribe?: () => void;

	constructor(
		private rpcRouter: RpcRouter,
		private eventBus: EventBus,
		private config: DaemonConfig,
		private logger: Logger
	) {}

	/**
	 * Start all API servers
	 */
	async start(): Promise<void> {
		await this.startUnixSocket();
		await this.startHttpServer();
		this.subscribeToEvents();
		this.logger.info('api', 'API servers started', {
			unixSocket: this.config.unixSocket,
			httpPort: this.config.httpPort,
		});
	}

	/**
	 * Stop all API servers
	 */
	async stop(): Promise<void> {
		this.logger.info('api', 'Stopping API servers');

		// Unsubscribe from events
		if (this.eventUnsubscribe) {
			this.eventUnsubscribe();
		}

		// Close HTTP server
		if (this.httpServer) {
			await new Promise<void>((resolve) => {
				this.httpServer!.close(() => resolve());
			});
		}

		// Close Unix socket
		if (this.unixServer) {
			await new Promise<void>((resolve) => {
				this.unixServer!.close(() => resolve());
			});
			// Clean up socket file
			if (fs.existsSync(this.config.unixSocket)) {
				fs.unlinkSync(this.config.unixSocket);
			}
		}

		// Close all WebSocket clients
		for (const ws of this.wsClients) {
			ws.close();
		}
		this.wsClients.clear();

		this.logger.info('api', 'API servers stopped');
	}

	// ─── Unix Socket Server ──────────────────────────────────────────────────

	private async startUnixSocket(): Promise<void> {
		// Remove existing socket file
		if (fs.existsSync(this.config.unixSocket)) {
			fs.unlinkSync(this.config.unixSocket);
		}

		this.unixServer = net.createServer((socket) => {
			this.logger.debug('api', 'Unix socket client connected');

			let buffer = '';

			socket.on('data', async (chunk) => {
				buffer += chunk.toString();

				// Process complete lines (newline-delimited JSON)
				let newlineIndex: number;
				while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);

					if (line.trim()) {
						try {
							const request: JsonRpcRequest = JSON.parse(line);
							const response = await this.rpcRouter.handle(request);
							socket.write(JSON.stringify(response) + '\n');
						} catch (error) {
							this.logger.error('api', 'Unix socket parse error', { error: String(error) });
							const errorResponse: JsonRpcResponse = {
								jsonrpc: '2.0',
								error: {
									code: -32700,
									message: 'Parse error',
								},
								id: null,
							};
							socket.write(JSON.stringify(errorResponse) + '\n');
						}
					}
				}
			});

			socket.on('error', (error) => {
				this.logger.error('api', 'Unix socket error', { error: String(error) });
			});

			socket.on('close', () => {
				this.logger.debug('api', 'Unix socket client disconnected');
			});
		});

		this.unixServer.listen(this.config.unixSocket);
		this.logger.info('api', `Unix socket listening on ${this.config.unixSocket}`);
	}

	// ─── HTTP Server ─────────────────────────────────────────────────────────

	private async startHttpServer(): Promise<void> {
		this.httpServer = http.createServer(async (req, res) => {
			// CORS headers
			if (this.config.enableCors) {
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

				if (req.method === 'OPTIONS') {
					res.writeHead(204);
					res.end();
					return;
				}
			}

			// Route requests
			if (req.method === 'POST' && req.url === '/rpc') {
				await this.handleHttpRpc(req, res);
			} else if (req.method === 'GET' && req.url === '/health') {
				await this.handleHealth(req, res);
			} else if (req.method === 'GET' && req.url === '/events') {
				await this.handleSSE(req, res);
			} else if (req.url === '/ws') {
				// WebSocket upgrade handled separately
				res.writeHead(400);
				res.end('WebSocket upgrades not supported via HTTP server (use dedicated WS library)');
			} else {
				res.writeHead(404);
				res.end(JSON.stringify({ error: 'Not found' }));
			}
		});

		this.httpServer.listen(this.config.httpPort);
		this.logger.info('api', `HTTP server listening on port ${this.config.httpPort}`);
	}

	/**
	 * Handle HTTP JSON-RPC request
	 */
	private async handleHttpRpc(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readRequestBody(req);
			const request: JsonRpcRequest = JSON.parse(body);
			const response = await this.rpcRouter.handle(request);

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		} catch (error) {
			this.logger.error('api', 'HTTP RPC error', { error: String(error) });
			const errorResponse: JsonRpcResponse = {
				jsonrpc: '2.0',
				error: {
					code: -32700,
					message: 'Parse error',
				},
				id: null,
			};
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(errorResponse));
		}
	}

	/**
	 * Handle health check endpoint
	 */
	private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const healthRequest: JsonRpcRequest = {
				jsonrpc: '2.0',
				method: 'daemon.health',
				id: 'health-check',
			};
			const response = await this.rpcRouter.handle(healthRequest);

			const statusCode = response.result?.overall === 'healthy' ? 200 : 503;
			res.writeHead(statusCode, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response.result));
		} catch (error) {
			this.logger.error('api', 'Health check error', { error: String(error) });
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Health check failed' }));
		}
	}

	/**
	 * Handle Server-Sent Events endpoint
	 */
	private async handleSSE(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		});

		// Send initial connected message
		res.write('data: {"type":"connected"}\n\n');

		// Subscribe to events
		const unsubscribe = this.eventBus.onAny((event, ...args) => {
			const data = JSON.stringify({ type: event, data: args });
			res.write(`data: ${data}\n\n`);
		});

		// Clean up on disconnect
		req.on('close', () => {
			unsubscribe();
			this.logger.debug('api', 'SSE client disconnected');
		});

		this.logger.debug('api', 'SSE client connected');
	}

	/**
	 * Read request body
	 */
	private async readRequestBody(req: http.IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', (chunk) => {
				body += chunk.toString();
			});
			req.on('end', () => {
				resolve(body);
			});
			req.on('error', reject);
		});
	}

	// ─── Event Broadcasting ──────────────────────────────────────────────────

	/**
	 * Subscribe to EventBus and broadcast to WebSocket clients
	 */
	private subscribeToEvents(): void {
		this.eventUnsubscribe = this.eventBus.onAny((event, ...args) => {
			this.broadcastEvent(event, args);
		});
	}

	/**
	 * Broadcast event to all WebSocket clients
	 */
	private broadcastEvent(event: string, data: any[]): void {
		const message = JSON.stringify({
			jsonrpc: '2.0',
			method: 'event',
			params: { event, data },
		});

		for (const ws of this.wsClients) {
			try {
				// Check if WebSocket is open before sending
				if (ws.readyState === 1) {
					// 1 = OPEN
					ws.send(message);
				}
			} catch (error) {
				this.logger.error('api', 'WebSocket broadcast error', { error: String(error) });
			}
		}
	}
}

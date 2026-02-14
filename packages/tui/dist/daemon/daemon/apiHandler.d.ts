import { Logger } from './log';
import { DaemonConfig } from './config';
import { RpcRouter } from './rpcRouter';
import { DaemonEventBus } from './eventBus';
export declare class ApiHandler {
    private config;
    private logger;
    private router;
    private eventBus;
    private unixServer?;
    private httpServer?;
    private wsServer?;
    unixSocketListening: boolean;
    httpListening: boolean;
    wsListening: boolean;
    constructor(config: DaemonConfig, logger: Logger, router: RpcRouter, eventBus: DaemonEventBus);
    start(): Promise<void>;
    stop(): Promise<void>;
    private startUnixSocket;
    private stopUnixSocket;
    private handleUnixConnection;
    private startHttp;
    private stopHttp;
    private handleHttpRequest;
    private startWebSocket;
    private stopWebSocket;
    private handleWebSocketConnection;
}

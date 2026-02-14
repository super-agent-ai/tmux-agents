import { EventBus as CoreEventBus } from '../core/eventBus';
import { Logger } from './log';
import * as WebSocket from 'ws';
export declare class DaemonEventBus extends CoreEventBus {
    private wsClients;
    private logger?;
    private sseClients;
    private nextSseId;
    constructor(logger?: Logger);
    registerWebSocketClient(ws: WebSocket.WebSocket): void;
    registerSSEClient(res: any): number;
    emit(event: string, data: any): void;
    closeAllClients(): void;
}

/**
 * EventBus - Internal pub/sub system to replace vscode.EventEmitter
 * Used throughout core/ for event-driven architecture without VS Code dependencies
 */
export declare class EventBus {
    private handlers;
    private anyHandlers;
    /**
     * Subscribe to a specific event
     * @param event Event name (e.g., 'agent.spawned', 'task.moved')
     * @param handler Callback function
     * @returns Unsubscribe function
     */
    on(event: string, handler: Function): () => void;
    /**
     * Emit an event to all subscribers
     * @param event Event name
     * @param args Event arguments
     */
    emit(event: string, ...args: any[]): void;
    /**
     * Subscribe to all events
     * @param handler Callback that receives (event, ...args)
     * @returns Unsubscribe function
     */
    onAny(handler: (event: string, ...args: any[]) => void): () => void;
    /**
     * Remove all handlers for a specific event
     * @param event Event name
     */
    off(event: string): void;
    /**
     * Remove all handlers (for cleanup)
     */
    clear(): void;
    /**
     * Get count of handlers for an event (for debugging)
     */
    listenerCount(event: string): number;
}
//# sourceMappingURL=eventBus.d.ts.map
"use strict";
// ─── EventBus ──────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
/**
 * EventBus - Internal pub/sub system to replace vscode.EventEmitter
 * Used throughout core/ for event-driven architecture without VS Code dependencies
 */
class EventBus {
    constructor() {
        this.handlers = new Map();
        this.anyHandlers = new Set();
    }
    /**
     * Subscribe to a specific event
     * @param event Event name (e.g., 'agent.spawned', 'task.moved')
     * @param handler Callback function
     * @returns Unsubscribe function
     */
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        // Return unsubscribe function
        return () => {
            const eventHandlers = this.handlers.get(event);
            if (eventHandlers) {
                eventHandlers.delete(handler);
                if (eventHandlers.size === 0) {
                    this.handlers.delete(event);
                }
            }
        };
    }
    /**
     * Emit an event to all subscribers
     * @param event Event name
     * @param args Event arguments
     */
    emit(event, ...args) {
        // Notify specific event handlers
        const eventHandlers = this.handlers.get(event);
        if (eventHandlers) {
            for (const handler of eventHandlers) {
                try {
                    handler(...args);
                }
                catch (error) {
                    console.error(`EventBus: Error in handler for ${event}:`, error);
                }
            }
        }
        // Notify wildcard handlers
        for (const handler of this.anyHandlers) {
            try {
                handler(event, ...args);
            }
            catch (error) {
                console.error(`EventBus: Error in wildcard handler for ${event}:`, error);
            }
        }
    }
    /**
     * Subscribe to all events
     * @param handler Callback that receives (event, ...args)
     * @returns Unsubscribe function
     */
    onAny(handler) {
        this.anyHandlers.add(handler);
        return () => {
            this.anyHandlers.delete(handler);
        };
    }
    /**
     * Remove all handlers for a specific event
     * @param event Event name
     */
    off(event) {
        this.handlers.delete(event);
    }
    /**
     * Remove all handlers (for cleanup)
     */
    clear() {
        this.handlers.clear();
        this.anyHandlers.clear();
    }
    /**
     * Get count of handlers for an event (for debugging)
     */
    listenerCount(event) {
        return this.handlers.get(event)?.size ?? 0;
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=eventBus.js.map
// ─── EventBus ──────────────────────────────────────────────────────────────

/**
 * EventBus - Internal pub/sub system to replace vscode.EventEmitter
 * Used throughout core/ for event-driven architecture without VS Code dependencies
 */
export class EventBus {
	private handlers = new Map<string, Set<Function>>();
	private anyHandlers = new Set<(event: string, ...args: any[]) => void>();

	/**
	 * Subscribe to a specific event
	 * @param event Event name (e.g., 'agent.spawned', 'task.moved')
	 * @param handler Callback function
	 * @returns Unsubscribe function
	 */
	on(event: string, handler: Function): () => void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, new Set());
		}
		this.handlers.get(event)!.add(handler);

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
	emit(event: string, ...args: any[]): void {
		// Notify specific event handlers
		const eventHandlers = this.handlers.get(event);
		if (eventHandlers) {
			for (const handler of eventHandlers) {
				try {
					handler(...args);
				} catch (error) {
					console.error(`EventBus: Error in handler for ${event}:`, error);
				}
			}
		}

		// Notify wildcard handlers
		for (const handler of this.anyHandlers) {
			try {
				handler(event, ...args);
			} catch (error) {
				console.error(`EventBus: Error in wildcard handler for ${event}:`, error);
			}
		}
	}

	/**
	 * Subscribe to all events
	 * @param handler Callback that receives (event, ...args)
	 * @returns Unsubscribe function
	 */
	onAny(handler: (event: string, ...args: any[]) => void): () => void {
		this.anyHandlers.add(handler);
		return () => {
			this.anyHandlers.delete(handler);
		};
	}

	/**
	 * Remove all handlers for a specific event
	 * @param event Event name
	 */
	off(event: string): void {
		this.handlers.delete(event);
	}

	/**
	 * Remove all handlers (for cleanup)
	 */
	clear(): void {
		this.handlers.clear();
		this.anyHandlers.clear();
	}

	/**
	 * Get count of handlers for an event (for debugging)
	 */
	listenerCount(event: string): number {
		return this.handlers.get(event)?.size ?? 0;
	}
}

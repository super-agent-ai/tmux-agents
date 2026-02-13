// ─── EventEmitter ──────────────────────────────────────────────────────────

import { EventBus } from './eventBus';
import { Disposable } from './disposable';

/**
 * Event callback type
 */
export type Event<T> = (listener: (e: T) => any, thisArgs?: any) => Disposable;

/**
 * EventEmitter - VS Code-compatible event emitter backed by EventBus
 * Provides the .event property pattern that VS Code uses
 */
export class EventEmitter<T> implements Disposable {
	private eventBus: EventBus;
	private eventName: string;
	private isDisposed = false;

	constructor(eventName?: string) {
		this.eventBus = new EventBus();
		this.eventName = eventName || `event-${Math.random().toString(36).slice(2, 11)}`;
	}

	/**
	 * The event property that listeners subscribe to
	 */
	get event(): Event<T> {
		return (listener: (e: T) => any, thisArgs?: any): Disposable => {
			const handler = thisArgs ? listener.bind(thisArgs) : listener;
			const unsubscribe = this.eventBus.on(this.eventName, handler);
			return { dispose: unsubscribe };
		};
	}

	/**
	 * Fire the event with data
	 */
	fire(data: T): void {
		if (this.isDisposed) {
			return;
		}
		this.eventBus.emit(this.eventName, data);
	}

	/**
	 * Dispose of this event emitter
	 */
	dispose(): void {
		if (this.isDisposed) {
			return;
		}
		this.isDisposed = true;
		this.eventBus.clear();
	}
}

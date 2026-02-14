// ─── EventEmitter ──────────────────────────────────────────────────────────
import { EventBus } from './eventBus';
/**
 * EventEmitter - VS Code-compatible event emitter backed by EventBus
 * Provides the .event property pattern that VS Code uses
 */
export class EventEmitter {
    constructor(eventName) {
        this.isDisposed = false;
        this.eventBus = new EventBus();
        this.eventName = eventName || `event-${Math.random().toString(36).slice(2, 11)}`;
    }
    /**
     * The event property that listeners subscribe to
     */
    get event() {
        return (listener, thisArgs) => {
            const handler = thisArgs ? listener.bind(thisArgs) : listener;
            const unsubscribe = this.eventBus.on(this.eventName, handler);
            return { dispose: unsubscribe };
        };
    }
    /**
     * Fire the event with data
     */
    fire(data) {
        if (this.isDisposed) {
            return;
        }
        this.eventBus.emit(this.eventName, data);
    }
    /**
     * Dispose of this event emitter
     */
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.eventBus.clear();
    }
}
//# sourceMappingURL=eventEmitter.js.map
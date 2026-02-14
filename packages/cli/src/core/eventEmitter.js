"use strict";
// ─── EventEmitter ──────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
const eventBus_1 = require("./eventBus");
/**
 * EventEmitter - VS Code-compatible event emitter backed by EventBus
 * Provides the .event property pattern that VS Code uses
 */
class EventEmitter {
    constructor(eventName) {
        this.isDisposed = false;
        this.eventBus = new eventBus_1.EventBus();
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
exports.EventEmitter = EventEmitter;
//# sourceMappingURL=eventEmitter.js.map
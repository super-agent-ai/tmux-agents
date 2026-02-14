import { Disposable } from './disposable';
export type { Disposable };
/**
 * Event callback type
 */
export type Event<T> = (listener: (e: T) => any, thisArgs?: any) => Disposable;
/**
 * EventEmitter - VS Code-compatible event emitter backed by EventBus
 * Provides the .event property pattern that VS Code uses
 */
export declare class EventEmitter<T> implements Disposable {
    private eventBus;
    private eventName;
    private isDisposed;
    constructor(eventName?: string);
    /**
     * The event property that listeners subscribe to
     */
    get event(): Event<T>;
    /**
     * Fire the event with data
     */
    fire(data: T): void;
    /**
     * Dispose of this event emitter
     */
    dispose(): void;
}
//# sourceMappingURL=eventEmitter.d.ts.map
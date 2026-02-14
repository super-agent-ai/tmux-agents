/**
 * Disposable interface - provides cleanup capabilities
 * Replaces vscode.Disposable in core/
 */
export interface Disposable {
    dispose(): void;
}
/**
 * Create a disposable from a cleanup function
 */
export declare function toDisposable(fn: () => void): Disposable;
/**
 * Composite disposable - manages multiple disposables
 */
export declare class DisposableStore implements Disposable {
    private disposables;
    private isDisposed;
    add<T extends Disposable>(disposable: T): T;
    dispose(): void;
}
//# sourceMappingURL=disposable.d.ts.map
// ─── Disposable ────────────────────────────────────────────────────────────
/**
 * Create a disposable from a cleanup function
 */
export function toDisposable(fn) {
    return { dispose: fn };
}
/**
 * Composite disposable - manages multiple disposables
 */
export class DisposableStore {
    constructor() {
        this.disposables = [];
        this.isDisposed = false;
    }
    add(disposable) {
        if (this.isDisposed) {
            disposable.dispose();
        }
        else {
            this.disposables.push(disposable);
        }
        return disposable;
    }
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
//# sourceMappingURL=disposable.js.map
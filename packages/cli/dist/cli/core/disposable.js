"use strict";
// ─── Disposable ────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisposableStore = void 0;
exports.toDisposable = toDisposable;
/**
 * Create a disposable from a cleanup function
 */
function toDisposable(fn) {
    return { dispose: fn };
}
/**
 * Composite disposable - manages multiple disposables
 */
class DisposableStore {
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
exports.DisposableStore = DisposableStore;
//# sourceMappingURL=disposable.js.map
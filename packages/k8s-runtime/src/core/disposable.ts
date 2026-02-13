// ─── Disposable ────────────────────────────────────────────────────────────

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
export function toDisposable(fn: () => void): Disposable {
	return { dispose: fn };
}

/**
 * Composite disposable - manages multiple disposables
 */
export class DisposableStore implements Disposable {
	private disposables: Disposable[] = [];
	private isDisposed = false;

	add<T extends Disposable>(disposable: T): T {
		if (this.isDisposed) {
			disposable.dispose();
		} else {
			this.disposables.push(disposable);
		}
		return disposable;
	}

	dispose(): void {
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

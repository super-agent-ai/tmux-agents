import { vi } from 'vitest';
export const workspace = {
    getConfiguration: vi.fn(() => ({ get: vi.fn(() => undefined) })),
    onDidChangeConfiguration: vi.fn((callback) => {
        // Return disposable, but never actually fire the event in tests
        return { dispose: () => {} };
    }),
    workspaceFolders: [],
};
export const window = {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    createTerminal: vi.fn(),
    activeTerminal: undefined,
    terminals: [],
};
export const commands = { executeCommand: vi.fn(), registerCommand: vi.fn() };
export const Uri = { file: (f: string) => ({ fsPath: f, scheme: 'file' }) };
export class EventEmitter { fire = vi.fn(); event = vi.fn(); dispose = vi.fn(); }
export class ThemeIcon { constructor(public id: string) {} }
export class ThemeColor { constructor(public id: string) {} }
export class TreeItem { constructor(public label: string) {} }
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }
export class Disposable { static from = vi.fn(); dispose = vi.fn(); }

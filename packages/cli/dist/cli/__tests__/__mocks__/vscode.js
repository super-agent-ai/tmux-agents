"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Disposable = exports.TreeItemCollapsibleState = exports.TreeItem = exports.ThemeColor = exports.ThemeIcon = exports.EventEmitter = exports.Uri = exports.commands = exports.window = exports.workspace = void 0;
const vitest_1 = require("vitest");
exports.workspace = {
    getConfiguration: vitest_1.vi.fn(() => ({ get: vitest_1.vi.fn(() => undefined) })),
    workspaceFolders: [],
};
exports.window = {
    showInformationMessage: vitest_1.vi.fn(),
    showErrorMessage: vitest_1.vi.fn(),
    showWarningMessage: vitest_1.vi.fn(),
    showInputBox: vitest_1.vi.fn(),
    showQuickPick: vitest_1.vi.fn(),
    createTerminal: vitest_1.vi.fn(),
    activeTerminal: undefined,
    terminals: [],
};
exports.commands = { executeCommand: vitest_1.vi.fn(), registerCommand: vitest_1.vi.fn() };
exports.Uri = { file: (f) => ({ fsPath: f, scheme: 'file' }) };
class EventEmitter {
    constructor() {
        this.fire = vitest_1.vi.fn();
        this.event = vitest_1.vi.fn();
        this.dispose = vitest_1.vi.fn();
    }
}
exports.EventEmitter = EventEmitter;
class ThemeIcon {
    constructor(id) {
        this.id = id;
    }
}
exports.ThemeIcon = ThemeIcon;
class ThemeColor {
    constructor(id) {
        this.id = id;
    }
}
exports.ThemeColor = ThemeColor;
class TreeItem {
    constructor(label) {
        this.label = label;
    }
}
exports.TreeItem = TreeItem;
var TreeItemCollapsibleState;
(function (TreeItemCollapsibleState) {
    TreeItemCollapsibleState[TreeItemCollapsibleState["None"] = 0] = "None";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Collapsed"] = 1] = "Collapsed";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Expanded"] = 2] = "Expanded";
})(TreeItemCollapsibleState || (exports.TreeItemCollapsibleState = TreeItemCollapsibleState = {}));
class Disposable {
    constructor() {
        this.dispose = vitest_1.vi.fn();
    }
}
exports.Disposable = Disposable;
Disposable.from = vitest_1.vi.fn();
//# sourceMappingURL=vscode.js.map
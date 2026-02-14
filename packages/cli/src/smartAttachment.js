"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartAttachmentService = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./core/types");
class SmartAttachmentService {
    /**
     * Resolve which attachment strategy to use for a given session.
     */
    resolveStrategy(sessionName, serverId, existingTerminals) {
        // Strategy a: DEDUPLICATE - check if a terminal is already attached to this session
        const duplicate = this.findDuplicateTerminal(sessionName, serverId, existingTerminals);
        if (duplicate) {
            return {
                strategy: types_1.AttachmentStrategy.DEDUPLICATE,
                terminalName: duplicate.name,
                isNew: false
            };
        }
        // Strategy b: REUSE_EXISTING - check for exact name match
        const existingNames = existingTerminals.map(t => t.name);
        const baseName = serverId === 'local' ? `tmux-mgr:${sessionName}` : `tmux-mgr:${serverId}:${sessionName}`;
        const exactMatch = existingTerminals.find(t => t.name === baseName);
        if (exactMatch) {
            return {
                strategy: types_1.AttachmentStrategy.REUSE_EXISTING,
                terminalName: exactMatch.name,
                isNew: false
            };
        }
        // Strategy c: CREATE_IN_EDITOR - default for new terminals
        const terminalName = this.generateTerminalName(baseName, existingNames);
        return {
            strategy: types_1.AttachmentStrategy.CREATE_IN_EDITOR,
            terminalName,
            isNew: true
        };
    }
    /**
     * Attach to a tmux session, reusing or creating a VS Code terminal as appropriate.
     */
    async attachToSession(service, sessionName, options) {
        const existingTerminals = vscode.window.terminals;
        const baseName = service.serverId === 'local'
            ? `tmux-mgr:${sessionName}`
            : `tmux-mgr:${service.serverId}:${sessionName}`;
        // Kill all existing terminals with the same name
        for (const t of existingTerminals) {
            if (t.name === baseName || this.findDuplicateTerminal(sessionName, service.serverId, [t])) {
                t.dispose();
            }
        }
        // Always create a fresh terminal in the editor area
        const attachCommand = service.buildTerminalCommand(`tmux attach -t "${sessionName}"`);
        const terminal = vscode.window.createTerminal({
            name: baseName,
            location: vscode.TerminalLocation.Editor,
            shellPath: '/usr/bin/env',
            shellArgs: ['bash', '--norc', '--noprofile', '-c', attachCommand]
        });
        // Select window/pane if specified
        if (options?.windowIndex) {
            await service.selectWindow(sessionName, options.windowIndex);
            if (options?.paneIndex) {
                await service.selectPane(sessionName, options.windowIndex, options.paneIndex);
            }
        }
        return terminal;
    }
    /**
     * Find an existing terminal that is already attached to the given tmux session.
     * Matches terminal names against patterns "sessionName" or "ServerLabel: sessionName".
     */
    findDuplicateTerminal(sessionName, serverId, terminals) {
        for (const terminal of terminals) {
            const name = terminal.name;
            // Match tmux-mgr: prefixed names
            const localName = `tmux-mgr:${sessionName}`;
            if (name === localName) {
                return terminal;
            }
            // Match remote pattern "tmux-mgr:serverId:sessionName"
            if (serverId !== 'local') {
                if (name === `tmux-mgr:${serverId}:${sessionName}`) {
                    return terminal;
                }
            }
            // Also match deduplicated names like "tmux-mgr:session (2)"
            const dedupePattern = serverId === 'local'
                ? new RegExp(`^${escapeRegExp(localName)}(?: \\(\\d+\\))?$`)
                : new RegExp(`^${escapeRegExp(`tmux-mgr:${serverId}:${sessionName}`)}(?: \\(\\d+\\))?$`);
            if (dedupePattern.test(name)) {
                return terminal;
            }
        }
        return undefined;
    }
    /**
     * Generate a unique terminal name by appending (2), (3), etc. if the base name is taken.
     */
    generateTerminalName(baseName, existingNames) {
        if (!existingNames.includes(baseName)) {
            return baseName;
        }
        let counter = 2;
        while (existingNames.includes(`${baseName} (${counter})`)) {
            counter++;
        }
        return `${baseName} (${counter})`;
    }
}
exports.SmartAttachmentService = SmartAttachmentService;
/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=smartAttachment.js.map
import * as vscode from 'vscode';
import { AttachmentStrategy } from './types';
export class SmartAttachmentService {
    /**
     * Resolve which attachment strategy to use for a given session.
     */
    resolveStrategy(sessionName, serverId, existingTerminals) {
        // Strategy a: DEDUPLICATE - check if a terminal is already attached to this session
        const duplicate = this.findDuplicateTerminal(sessionName, serverId, existingTerminals);
        if (duplicate) {
            return {
                strategy: AttachmentStrategy.DEDUPLICATE,
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
                strategy: AttachmentStrategy.REUSE_EXISTING,
                terminalName: exactMatch.name,
                isNew: false
            };
        }
        // Strategy c: CREATE_IN_EDITOR - default for new terminals
        const terminalName = this.generateTerminalName(baseName, existingNames);
        return {
            strategy: AttachmentStrategy.CREATE_IN_EDITOR,
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
/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=smartAttachment.js.map
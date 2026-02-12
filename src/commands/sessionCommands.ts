import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { TmuxService } from '../tmuxService';
import { TmuxServiceManager } from '../serviceManager';
import { TmuxSessionProvider, TmuxSessionTreeItem, TmuxWindowTreeItem, TmuxPaneTreeItem, TmuxServerTreeItem } from '../treeProvider';
import { SmartAttachmentService } from '../smartAttachment';
import { AIAssistantManager } from '../aiAssistant';
import { HotkeyManager } from '../hotkeyManager';
import { AIProvider, TmuxSession } from '../types';

const execAsync = util.promisify(cp.exec);

export interface SessionCommandContext {
    serviceManager: TmuxServiceManager;
    tmuxSessionProvider: TmuxSessionProvider;
    smartAttachment: SmartAttachmentService;
    aiManager: AIAssistantManager;
    hotkeyManager: HotkeyManager;
    getServiceForItem: (item: TmuxSessionTreeItem | TmuxWindowTreeItem | TmuxPaneTreeItem) => TmuxService | undefined;
    pickService: () => Promise<TmuxService | undefined>;
}

export function registerSessionCommands(
    context: vscode.ExtensionContext,
    ctx: SessionCommandContext
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // ── Attach ────────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.attach', async (item: TmuxSessionTreeItem | TmuxWindowTreeItem | TmuxPaneTreeItem) => {
        if (!item) {
            vscode.window.showErrorMessage('No item selected for attach');
            return;
        }

        let sessionName: string;
        let itemType: 'session' | 'window' | 'pane' = 'session';
        let service: TmuxService | undefined;

        if (item instanceof TmuxSessionTreeItem) {
            if (!item.session || !item.session.name) {
                vscode.window.showErrorMessage('Invalid session data');
                return;
            }
            sessionName = item.session.name;
            itemType = 'session';
            service = ctx.getServiceForItem(item);
        } else if (item instanceof TmuxWindowTreeItem) {
            if (!item.window || !item.window.sessionName) {
                vscode.window.showErrorMessage('Invalid window data');
                return;
            }
            sessionName = item.window.sessionName;
            itemType = 'window';
            service = ctx.getServiceForItem(item);
        } else if (item instanceof TmuxPaneTreeItem) {
            if (!item.pane || !item.pane.sessionName) {
                vscode.window.showErrorMessage('Invalid pane data');
                return;
            }
            sessionName = item.pane.sessionName;
            itemType = 'pane';
            service = ctx.getServiceForItem(item);
        } else {
            const fallbackItem = item as any;
            if (fallbackItem && typeof fallbackItem.label === 'string') {
                sessionName = fallbackItem.label;
                service = ctx.serviceManager.getService('local');
            } else {
                vscode.window.showErrorMessage('Unknown item type for attach operation');
                return;
            }
        }

        if (!service) {
            vscode.window.showErrorMessage('Could not find server for this item');
            return;
        }

        const terminal = await ctx.smartAttachment.attachToSession(service, sessionName, {
            windowIndex: itemType === 'window' ? (item as TmuxWindowTreeItem).window.index :
                         itemType === 'pane' ? (item as TmuxPaneTreeItem).pane.windowIndex : undefined,
            paneIndex: itemType === 'pane' ? (item as TmuxPaneTreeItem).pane.index : undefined
        });
        terminal.show();
    }));

    // ── Refresh & Toggle ──────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.refresh', async () => {
        for (const service of ctx.serviceManager.getAllServices()) {
            service.clearCache();
        }
        ctx.tmuxSessionProvider.refresh();
    }));

    disposables.push(vscode.commands.registerCommand('tmux-agents.toggleAutoRefresh', () => {
        ctx.tmuxSessionProvider.toggleAutoRefresh();
    }));

    // ── Rename ────────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.rename', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for rename operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const oldName = item.session.name;

        const newName = await vscode.window.showInputBox({
            prompt: `Rename tmux session "${oldName}"`,
            value: oldName,
            validateInput: value => value ? null : 'Session name cannot be empty.'
        });

        if (newName && newName !== oldName) {
            await service.renameSession(oldName, newName);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    disposables.push(vscode.commands.registerCommand('tmux-agents.renameWindow', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window || !item.window.sessionName || !item.window.index) {
            vscode.window.showErrorMessage('Invalid window data for rename operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, index, name } = item.window;
        const oldName = name;

        const newName = await vscode.window.showInputBox({
            prompt: `Rename window "${index}:${oldName}" in session "${sessionName}"`,
            value: oldName,
            validateInput: value => {
                if (!value || value.trim() === '') {
                    return 'Window name cannot be empty.';
                }
                return null;
            }
        });

        if (newName && newName !== oldName) {
            try {
                await service.renameWindow(sessionName, index, newName);
                ctx.tmuxSessionProvider.refresh();
            } catch (error) {
                // Error is already shown by the service
            }
        }
    }));

    // ── New Session ───────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.new', async (item?: TmuxServerTreeItem) => {
        let service: TmuxService | undefined;

        if (item instanceof TmuxServerTreeItem) {
            service = ctx.serviceManager.getService(item.server.id);
        } else {
            service = await ctx.pickService();
        }

        if (!service) { return; }

        const sessions = await service.getSessions();
        let nextId = 0;
        while (sessions.includes(String(nextId))) {
            nextId++;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new session name',
            value: String(nextId),
            validateInput: value => {
                if (!value) return 'Session name cannot be empty.';
                if (sessions.includes(value)) return `Session name "${value}" already exists.`;
                return null;
            }
        });

        if (newName) {
            try {
                await service.newSession(newName);
                ctx.tmuxSessionProvider.refresh();
                const terminal = await ctx.smartAttachment.attachToSession(service, newName);
                terminal.show();
            } catch (error) {
                // Error is already shown by the service
            }
        }
    }));

    // ── Delete Session ────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.delete', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for delete operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const sessionName = item.session.name;

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete the tmux session "${sessionName}"?`,
            { modal: true },
            'Delete'
        );

        if (confirmation === 'Delete') {
            await service.deleteSession(sessionName);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── Kill Window ───────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.kill-window', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window) {
            vscode.window.showErrorMessage('Invalid window data for kill operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, index, name } = item.window;

        if (!sessionName || !index) {
            vscode.window.showErrorMessage('Missing window information');
            return;
        }
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to kill window "${index}:${name}"?`,
            { modal: true },
            'Kill Window'
        );

        if (confirmation === 'Kill Window') {
            await service.killWindow(sessionName, index);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── Kill Pane ─────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.kill-pane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for kill operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, windowIndex, index, command } = item.pane;

        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information');
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to kill pane "${index}: ${command || 'unknown'}"?`,
            { modal: true },
            'Kill Pane'
        );

        if (confirmation === 'Kill Pane') {
            await service.killPane(sessionName, windowIndex, index);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── New Window ────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.newWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for new window operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const sessionName = item.session.name;
        const windowName = await vscode.window.showInputBox({
            prompt: `Enter name for new window in session "${sessionName}"`,
            placeHolder: 'Leave empty for default name',
            validateInput: () => null
        });

        if (windowName === undefined) {
            return;
        }

        try {
            const finalWindowName = windowName.trim() || undefined;
            await service.newWindow(sessionName, finalWindowName);
            ctx.tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    // ── Split Pane ────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.splitPaneRight', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const targetPane = `${sessionName}:${windowIndex}.${index}`;
        await service.splitPane(targetPane, 'h');
        ctx.tmuxSessionProvider.refresh();
    }));

    disposables.push(vscode.commands.registerCommand('tmux-agents.splitPaneDown', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const targetPane = `${sessionName}:${windowIndex}.${index}`;
        await service.splitPane(targetPane, 'v');
        ctx.tmuxSessionProvider.refresh();
    }));

    // ── Inline New Window ─────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.inline.newWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for new window operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const sessionName = item.session.name;
        const windowName = await vscode.window.showInputBox({
            prompt: `Enter name for new window in session "${sessionName}"`,
            placeHolder: 'Leave empty for default name',
            validateInput: () => null
        });

        if (windowName === undefined) {
            return;
        }

        try {
            const finalWindowName = windowName.trim() || undefined;
            await service.newWindow(sessionName, finalWindowName);
            ctx.tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    // ── Inline Split Pane ─────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.inline.splitPane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for split operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        if (!sessionName || !windowIndex || !index) {
            vscode.window.showErrorMessage('Missing pane information for split');
            return;
        }

        const choice = await vscode.window.showQuickPick(['Split Right', 'Split Down'], {
            placeHolder: 'Select split direction'
        });

        if (choice) {
            const direction = choice === 'Split Right' ? 'h' : 'v';
            const targetPane = `${sessionName}:${windowIndex}.${index}`;
            await service.splitPane(targetPane, direction);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── Rename Pane ────────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.renamePane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for rename operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, windowIndex, index, command } = item.pane;

        const newTitle = await vscode.window.showInputBox({
            prompt: `Rename pane ${index} (${command})`,
            value: command,
            validateInput: value => value ? null : 'Pane title cannot be empty.'
        });

        if (newTitle && newTitle !== command) {
            try {
                const escaped = newTitle.replace(/"/g, '\\"');
                await service.sendKeys(sessionName, windowIndex, index, '');
                const target = `${sessionName}:${windowIndex}.${index}`;
                const cmd = `tmux select-pane -t "${target}" -T "${escaped}"`;
                await execAsync(cmd, { timeout: 5000 });
                ctx.tmuxSessionProvider.refresh();
                vscode.window.showInformationMessage(`Pane ${index} renamed to "${newTitle}"`);
            } catch {
                vscode.window.showErrorMessage(`Failed to rename pane ${index}`);
            }
        }
    }));

    // ── Add Pane to Window ───────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.addPaneToWindow', async (item: TmuxWindowTreeItem) => {
        if (!item || !item.window) {
            vscode.window.showErrorMessage('Invalid window data for add pane operation');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const { sessionName, index: windowIndex, panes } = item.window;
        if (!sessionName || !windowIndex) {
            vscode.window.showErrorMessage('Missing window information');
            return;
        }

        const choice = await vscode.window.showQuickPick(['Split Right', 'Split Down'], {
            placeHolder: 'Select split direction for new pane'
        });

        if (choice) {
            const activePaneIndex = panes.find(p => p.isActive)?.index || panes[0]?.index || '0';
            const direction = choice === 'Split Right' ? 'h' : 'v';
            const targetPane = `${sessionName}:${windowIndex}.${activePaneIndex}`;
            await service.splitPane(targetPane, direction);
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── Test Connection ───────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.testConnection', async (item: TmuxServerTreeItem) => {
        if (!item || item.server.isLocal) {
            vscode.window.showInformationMessage('Local server is always available.');
            return;
        }
        const service = ctx.serviceManager.getService(item.server.id);
        if (service) {
            service.resetConnectionState();
            try {
                await service.getTmuxTreeFresh();
                vscode.window.showInformationMessage(`Connected to ${item.server.label} successfully.`);
            } catch {
                // Error message already shown by service
            }
            ctx.tmuxSessionProvider.refresh();
        }
    }));

    // ── Open Server Terminal ────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.openServerTerminal', async (item: TmuxServerTreeItem) => {
        if (!item) { return; }

        const service = ctx.serviceManager.getService(item.server.id);
        if (!service) { return; }

        const terminalName = `tmux-mgr:${item.server.label}`;

        for (const t of vscode.window.terminals) {
            if (t.name === terminalName) {
                t.dispose();
            }
        }

        if (item.server.isLocal) {
            const terminal = vscode.window.createTerminal({
                name: terminalName,
                location: vscode.TerminalLocation.Editor
            });
            terminal.show();
        } else {
            const sshCommand = service.buildSshCommand();
            if (sshCommand) {
                const terminal = vscode.window.createTerminal({
                    name: terminalName,
                    location: vscode.TerminalLocation.Editor,
                    shellPath: '/usr/bin/env',
                    shellArgs: ['bash', '--norc', '--noprofile', '-c', sshCommand]
                });
                terminal.show();
            }
        }
    }));

    // ── Configure Servers ─────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.configureServers', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'tmuxAgents.sshServers');
    }));

    // ── AI Session Commands ───────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.newClaudeSession', async () => {
        await createAISessionCommand(AIProvider.CLAUDE, ctx);
    }));

    disposables.push(vscode.commands.registerCommand('tmux-agents.newGeminiSession', async () => {
        await createAISessionCommand(AIProvider.GEMINI, ctx);
    }));

    disposables.push(vscode.commands.registerCommand('tmux-agents.newCodexSession', async () => {
        await createAISessionCommand(AIProvider.CODEX, ctx);
    }));

    // ── New AI Window (on session) ────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.newAIWindow', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for AI window');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const providerChoice = await vscode.window.showQuickPick(
            [
                { label: 'Claude', provider: AIProvider.CLAUDE },
                { label: 'Gemini', provider: AIProvider.GEMINI },
                { label: 'Codex', provider: AIProvider.CODEX },
                { label: 'OpenCode', provider: AIProvider.OPENCODE },
                { label: 'Cursor', provider: AIProvider.CURSOR },
                { label: 'Copilot', provider: AIProvider.COPILOT },
                { label: 'Aider', provider: AIProvider.AIDER },
                { label: 'Amp', provider: AIProvider.AMP },
                { label: 'Cline', provider: AIProvider.CLINE },
                { label: 'Kiro', provider: AIProvider.KIRO }
            ],
            { placeHolder: 'Select AI provider' }
        );
        if (!providerChoice) { return; }

        const sessionName = item.session.name;
        const windowName = `${providerChoice.label.toLowerCase()}-ai`;

        try {
            await service.newWindow(sessionName, windowName);
            service.clearCache();

            const sessions = await service.getTmuxTreeFresh();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
                const newWindow = session.windows.find(w => w.name === windowName);
                if (newWindow) {
                    const launchCmd = ctx.aiManager.getLaunchCommand(providerChoice.provider);
                    await service.sendKeys(sessionName, newWindow.index, '0', launchCmd);
                }
            }

            ctx.tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    // ── New AI Pane (on pane) ─────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.newAIPane', async (item: TmuxPaneTreeItem) => {
        if (!item || !item.pane) {
            vscode.window.showErrorMessage('Invalid pane data for AI pane');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const providerChoice = await vscode.window.showQuickPick(
            [
                { label: 'Claude', provider: AIProvider.CLAUDE },
                { label: 'Gemini', provider: AIProvider.GEMINI },
                { label: 'Codex', provider: AIProvider.CODEX },
                { label: 'OpenCode', provider: AIProvider.OPENCODE },
                { label: 'Cursor', provider: AIProvider.CURSOR },
                { label: 'Copilot', provider: AIProvider.COPILOT },
                { label: 'Aider', provider: AIProvider.AIDER },
                { label: 'Amp', provider: AIProvider.AMP },
                { label: 'Cline', provider: AIProvider.CLINE },
                { label: 'Kiro', provider: AIProvider.KIRO }
            ],
            { placeHolder: 'Select AI provider' }
        );
        if (!providerChoice) { return; }

        const { sessionName, windowIndex, index } = item.pane;
        const targetPane = `${sessionName}:${windowIndex}.${index}`;

        try {
            await service.splitPane(targetPane, 'h');
            service.clearCache();

            const sessions = await service.getTmuxTreeFresh();
            const session = sessions.find(s => s.name === sessionName);
            if (session) {
                const win = session.windows.find(w => w.index === windowIndex);
                if (win && win.panes.length > 0) {
                    const newPane = win.panes[win.panes.length - 1];
                    const launchCmd = ctx.aiManager.getLaunchCommand(providerChoice.provider);
                    await service.sendKeys(sessionName, windowIndex, newPane.index, launchCmd);
                }
            }

            ctx.tmuxSessionProvider.refresh();
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    // ── Fork AI Session ───────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.forkAISession', async (item: TmuxSessionTreeItem) => {
        if (!item || !item.session || !item.session.name) {
            vscode.window.showErrorMessage('Invalid session data for fork');
            return;
        }

        const service = ctx.getServiceForItem(item);
        if (!service) { return; }

        const sessionName = item.session.name;

        let provider: AIProvider | null = null;
        if (item.session.windows.length > 0 && item.session.windows[0].panes.length > 0) {
            provider = ctx.aiManager.detectAIProvider(item.session.windows[0].panes[0].command);
        }

        if (!provider) {
            const providerChoice = await vscode.window.showQuickPick(
                [
                    { label: 'Claude', provider: AIProvider.CLAUDE },
                    { label: 'Gemini', provider: AIProvider.GEMINI },
                    { label: 'Codex', provider: AIProvider.CODEX },
                    { label: 'OpenCode', provider: AIProvider.OPENCODE },
                    { label: 'Cursor', provider: AIProvider.CURSOR },
                    { label: 'Copilot', provider: AIProvider.COPILOT }
                ],
                { placeHolder: 'Select AI provider for fork' }
            );
            if (!providerChoice) { return; }
            provider = providerChoice.provider;
        }

        const forkName = `${sessionName}-fork`;
        const sessions = await service.getSessions();

        let finalForkName = forkName;
        let counter = 2;
        while (sessions.includes(finalForkName)) {
            finalForkName = `${forkName}-${counter}`;
            counter++;
        }

        try {
            await service.newSession(finalForkName);

            // Try to get the CC session ID from the source pane for a targeted resume
            let ccSessionId: string | undefined;
            const sourcePanes = item.session.windows.flatMap(w => w.panes);
            const aiPane = sourcePanes.find(p => p.aiInfo?.metadata?.sessionId);
            if (aiPane) {
                ccSessionId = aiPane.aiInfo!.metadata!.sessionId;
            } else {
                // Fall back to reading pane options directly if metadata wasn't enriched
                const paneWithId = sourcePanes.find(p => p.paneId);
                if (paneWithId?.paneId) {
                    const opts = await service.getPaneOptions(paneWithId.paneId);
                    ccSessionId = opts['cc_session_id'] || undefined;
                }
            }

            const forkCmd = ctx.aiManager.getForkCommand(provider, sessionName, ccSessionId);
            await service.sendKeysToSession(finalForkName, forkCmd);

            ctx.tmuxSessionProvider.refresh();

            const terminal = await ctx.smartAttachment.attachToSession(service, finalForkName);
            terminal.show();
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    // ── Hotkey Jump ───────────────────────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.hotkeyJump', async () => {
        const allSessions: TmuxSession[] = [];
        for (const service of ctx.serviceManager.getAllServices()) {
            try {
                const sessions = await service.getTmuxTree();
                allSessions.push(...sessions);
            } catch {
                // Skip services with errors
            }
        }

        if (allSessions.length === 0) {
            vscode.window.showInformationMessage('No tmux sessions found.');
            return;
        }

        const assignedSessions = ctx.hotkeyManager.assignHotkeys(allSessions);
        const assignments = ctx.hotkeyManager.getAllAssignments(assignedSessions);

        const items = assignments.map(a => {
            let label: string;
            if (a.type === 'session') {
                label = `[${a.key}] session: ${a.sessionName}`;
            } else if (a.type === 'window') {
                label = `[${a.key}] window: ${a.windowIndex}`;
            } else {
                label = `[${a.key}] pane: ${a.windowIndex}:${a.paneIndex}`;
            }
            return {
                label,
                description: a.type === 'session' ? '' : `in ${a.sessionName}`,
                assignment: a
            };
        });

        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: 'Jump to session/window/pane (hotkey)'
        });

        if (!pick) { return; }

        const a = pick.assignment;
        const service = ctx.serviceManager.getService(a.serverId);
        if (!service) {
            vscode.window.showErrorMessage('Could not find server for this item');
            return;
        }

        const terminal = await ctx.smartAttachment.attachToSession(service, a.sessionName, {
            windowIndex: a.windowIndex,
            paneIndex: a.paneIndex
        });
        terminal.show();
    }));

    // ── Rename AI (AI-assisted rename) ────────────────────────────────────────

    disposables.push(vscode.commands.registerCommand('tmux-agents.renameAI', async (item: TmuxSessionTreeItem | TmuxWindowTreeItem) => {
        if (!item) {
            vscode.window.showErrorMessage('No item selected for AI rename');
            return;
        }

        let service: TmuxService | undefined;
        let sessionName: string;
        let windowIndex: string;
        let paneIndex: string;
        let isSession: boolean;
        let oldName: string;

        if (item instanceof TmuxSessionTreeItem) {
            if (!item.session || !item.session.name) {
                vscode.window.showErrorMessage('Invalid session data');
                return;
            }
            service = ctx.getServiceForItem(item);
            sessionName = item.session.name;
            oldName = sessionName;
            isSession = true;
            windowIndex = item.session.windows[0]?.index || '0';
            paneIndex = item.session.windows[0]?.panes[0]?.index || '0';
        } else if (item instanceof TmuxWindowTreeItem) {
            if (!item.window || !item.window.sessionName) {
                vscode.window.showErrorMessage('Invalid window data');
                return;
            }
            service = ctx.getServiceForItem(item);
            sessionName = item.window.sessionName;
            oldName = item.window.name;
            isSession = false;
            windowIndex = item.window.index;
            paneIndex = item.window.panes[0]?.index || '0';
        } else {
            vscode.window.showErrorMessage('AI rename only works on sessions and windows');
            return;
        }

        if (!service) { return; }

        const captureConfig = ctx.serviceManager.getPaneCaptureConfig();
        const lines = captureConfig.lines || 50;
        const content = await service.capturePaneContent(sessionName, windowIndex, paneIndex, lines);
        const lastLines = content.trim().split('\n').slice(-lines).join('\n').slice(0, 500);

        let suggestedName = oldName;

        if (lastLines.length > 0) {
            vscode.window.showInformationMessage('Generating AI name...');

            try {
                const escaped = lastLines.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                const { stdout } = await execAsync(
                    `claude --print "Based on this terminal output, generate a short name (3 words or less, no quotes, no explanation, just the name):\\n${escaped}"`,
                    { timeout: 15000 }
                );
                const aiName = stdout.trim().split('\n')[0].trim();
                if (aiName && aiName.length > 0 && aiName.length < 50) {
                    suggestedName = aiName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                }
            } catch {
                // Claude CLI not available or failed, fall back to regular rename
            }
        }

        if (!suggestedName || suggestedName === oldName) {
            vscode.window.showWarningMessage('AI could not generate a new name');
            return;
        }

        try {
            if (isSession) {
                await service.renameSession(oldName, suggestedName);
            } else {
                await service.renameWindow(sessionName, windowIndex, suggestedName);
            }
            ctx.tmuxSessionProvider.refresh();
            vscode.window.showInformationMessage(`Renamed "${oldName}" → "${suggestedName}"`);
        } catch (error) {
            // Error is already shown by the service
        }
    }));

    return disposables;
}

async function createAISessionCommand(
    provider: AIProvider,
    ctx: SessionCommandContext
): Promise<void> {
    const service = await ctx.pickService();
    if (!service) { return; }

    const sessions = await service.getSessions();

    const prefix = provider === AIProvider.CLAUDE ? 'claude'
        : provider === AIProvider.GEMINI ? 'gemini'
        : provider === AIProvider.OPENCODE ? 'opencode'
        : provider === AIProvider.CURSOR ? 'cursor'
        : provider === AIProvider.COPILOT ? 'copilot'
        : provider === AIProvider.AIDER ? 'aider'
        : provider === AIProvider.AMP ? 'amp'
        : provider === AIProvider.CLINE ? 'cline'
        : provider === AIProvider.KIRO ? 'kiro'
        : 'codex';

    let nextId = 0;
    while (sessions.includes(`${prefix}-${nextId}`)) {
        nextId++;
    }
    const defaultName = `${prefix}-${nextId}`;

    const name = await vscode.window.showInputBox({
        prompt: `Enter name for new ${prefix} AI session`,
        value: defaultName,
        validateInput: value => {
            if (!value) { return 'Session name cannot be empty.'; }
            if (sessions.includes(value)) { return `Session "${value}" already exists.`; }
            return null;
        }
    });

    if (!name) { return; }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    try {
        await ctx.aiManager.createAISession(provider, service, name, workspacePath);
        ctx.tmuxSessionProvider.refresh();

        const terminal = await ctx.smartAttachment.attachToSession(service, name);
        terminal.show();
    } catch (error) {
        // Error already shown by the service
    }
}

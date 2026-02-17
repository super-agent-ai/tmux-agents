import * as vscode from 'vscode';
import { TmuxServiceManager } from './serviceManager';
import { TmuxSession, TmuxWindow, TmuxPane, ServerIdentity, CcPaneMetadata,
         ProcessCategory, PROCESS_CATEGORY_COLORS, PROCESS_CATEGORY_ICONS,
         AIStatus, AI_STATUS_COLORS, AI_STATUS_ICONS, ActivityPriority } from './types';
import { ProcessTracker } from './processTracker';
import { AIAssistantManager } from './core/aiAssistant';
import { ActivityRollupService } from './activityRollup';
import { HotkeyManager } from './hotkeyManager';
import { DaemonRefreshService } from './daemonRefresh';

type TmuxTreeItem = TmuxServerTreeItem | TmuxSessionTreeItem | TmuxWindowTreeItem | TmuxPaneTreeItem | HotkeyInfoTreeItem;

export class TmuxSessionProvider implements vscode.TreeDataProvider<TmuxTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TmuxTreeItem | undefined | null | void> = new vscode.EventEmitter<TmuxTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TmuxTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private processTracker: ProcessTracker;
    private aiManager: AIAssistantManager;
    private rollupService: ActivityRollupService;
    private hotkeyManager: HotkeyManager;
    private daemonRefresh: DaemonRefreshService;

    constructor(private serviceManager: TmuxServiceManager, private extensionPath: string) {
        this.processTracker = new ProcessTracker();
        this.aiManager = new AIAssistantManager();
        this.rollupService = new ActivityRollupService();
        this.hotkeyManager = new HotkeyManager();
        this.daemonRefresh = new DaemonRefreshService(
            () => this.refresh(),
            this.serviceManager.getDaemonRefreshConfig()
        );
        this.daemonRefresh.onLightRefresh = () => this.performLightRefresh();
        this.daemonRefresh.onFullRefresh = () => this.performFullRefresh();
        this.daemonRefresh.start();

        this.serviceManager.onConfigChanged(() => {
            this.daemonRefresh.setConfig(this.serviceManager.getDaemonRefreshConfig());
        });
    }

    private async performLightRefresh(): Promise<void> {
        const services = this.serviceManager.getAllServices();
        const allSessions: TmuxSession[] = [];
        for (const service of services) {
            try {
                const sessions = await service.getTmuxTree();
                allSessions.push(...sessions);
            } catch {
                // skip failed services
            }
        }
        if (this.daemonRefresh.hasChanged(allSessions)) {
            this.daemonRefresh.updateSnapshot(allSessions);
            this.refresh();
        }
    }

    private performFullRefresh(): void {
        for (const service of this.serviceManager.getAllServices()) {
            service.clearCache();
        }
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    toggleAutoRefresh(): void {
        const config = this.serviceManager.getDaemonRefreshConfig();
        if (config.enabled) {
            this.daemonRefresh.stop();
            this.daemonRefresh.setConfig({ enabled: false });
            vscode.window.showInformationMessage('Auto-refresh disabled');
        } else {
            this.daemonRefresh.setConfig({ enabled: true });
            this.daemonRefresh.start();
            vscode.window.showInformationMessage('Auto-refresh enabled');
        }
    }

    dispose(): void {
        this.daemonRefresh.dispose();
    }

    getTreeItem(element: TmuxTreeItem): vscode.TreeItem {
        return element;
    }

    private async enrichSessions(sessions: TmuxSession[]): Promise<TmuxSession[]> {
        // Step 0: Batch-read @cc_* pane options for all AI panes
        const ccOptionsMap = await this.batchReadCcOptions(sessions);

        // Step 1: Enrich each pane with process tracking and AI info
        const paneEnrichedSessions = sessions.map(session => ({
            ...session,
            windows: session.windows.map(window => ({
                ...window,
                panes: window.panes.map(pane => {
                    let enriched = this.processTracker.enrichPane(pane);
                    // Use @cc_* options when available, otherwise fall back to heuristic
                    const ccOpts = pane.paneId ? ccOptionsMap.get(pane.paneId) : undefined;
                    if (ccOpts && Object.keys(ccOpts).length > 0) {
                        enriched = this.aiManager.enrichPaneWithOptions(enriched, ccOpts);
                    } else {
                        enriched = this.aiManager.enrichPane(enriched);
                    }
                    return enriched;
                })
            }))
        }));

        // Step 2: Roll up activity summaries to windows and sessions
        const rolledUp = this.rollupService.enrichTree(paneEnrichedSessions);

        // Step 3: Assign hotkeys
        const withHotkeys = this.hotkeyManager.assignHotkeys(rolledUp);

        return withHotkeys;
    }

    /**
     * Batch-read @cc_* pane options for all AI panes, grouped by server.
     */
    private async batchReadCcOptions(sessions: TmuxSession[]): Promise<Map<string, Record<string, string>>> {
        const paneIdsByServer = new Map<string, string[]>();

        for (const session of sessions) {
            for (const window of session.windows) {
                for (const pane of window.panes) {
                    if (pane.paneId && this.aiManager.detectAIProvider(pane.command)) {
                        const ids = paneIdsByServer.get(session.serverId) || [];
                        ids.push(pane.paneId);
                        paneIdsByServer.set(session.serverId, ids);
                    }
                }
            }
        }

        const merged = new Map<string, Record<string, string>>();
        const promises: Promise<void>[] = [];

        for (const [serverId, paneIds] of paneIdsByServer) {
            const service = this.serviceManager.getService(serverId);
            if (!service) { continue; }
            promises.push(
                service.getMultiplePaneOptions(paneIds).then(serverMap => {
                    for (const [id, opts] of serverMap) {
                        merged.set(id, opts);
                    }
                }).catch(() => {})
            );
        }

        await Promise.all(promises);
        return merged;
    }

    private buildHotkeyFooter(): TmuxTreeItem[] {
        const items: TmuxTreeItem[] = [];
        items.push(new HotkeyInfoTreeItem('─── Shortcuts ───', '', 'keyboard'));
        items.push(new HotkeyInfoTreeItem('Ctrl+Alt+T', 'Jump to Hotkey', 'zap'));
        items.push(new HotkeyInfoTreeItem('Ctrl+Alt+N', 'New Session', 'add'));
        items.push(new HotkeyInfoTreeItem('Ctrl+Alt+C', 'New Claude Session', 'hubot'));
        items.push(new HotkeyInfoTreeItem('Ctrl+Alt+R', 'Refresh', 'refresh'));
        items.push(new HotkeyInfoTreeItem('Click', 'Attach to item', 'debug-start'));
        return items;
    }

    async getChildren(element?: TmuxTreeItem): Promise<TmuxTreeItem[]> {
        if (!element) {
            // ROOT LEVEL
            const services = this.serviceManager.getAllServices();

            // Always show server-level nodes — collect all sessions, then enrich together
            const serverResults: { service: typeof services[0]; sessions: TmuxSession[]; hasError: boolean }[] = [];
            const allSessions: TmuxSession[] = [];

            for (const service of services) {
                let sessions: TmuxSession[] = [];
                let hasError = false;
                try {
                    sessions = await service.getTmuxTree();
                    allSessions.push(...sessions);
                } catch {
                    hasError = true;
                }
                serverResults.push({ service, sessions, hasError });
            }

            // Enrich all sessions together so hotkeys are globally unique
            const enriched = allSessions.length > 0 ? await this.enrichSessions(allSessions) : [];

            // Map enriched sessions back to their servers
            const serverNodes: TmuxTreeItem[] = [];
            for (const { service, sessions, hasError } of serverResults) {
                const serverSessions = hasError ? [] : enriched.filter(s => s.serverId === service.serverId);
                serverNodes.push(new TmuxServerTreeItem(
                    service.serverIdentity,
                    serverSessions,
                    hasError
                ));
            }
            return serverNodes;
        }

        if (element instanceof TmuxServerTreeItem) {
            // SERVER -> SESSIONS
            if (element.hasError) {
                const item = new vscode.TreeItem('Connection error', vscode.TreeItemCollapsibleState.None);
                item.iconPath = new vscode.ThemeIcon('warning');
                return [item as TmuxTreeItem];
            }
            if (element.sessions.length === 0) {
                const item = new vscode.TreeItem('No tmux sessions', vscode.TreeItemCollapsibleState.None);
                return [item as TmuxTreeItem];
            }
            return element.sessions.map(s => new TmuxSessionTreeItem(s));
        }

        if (element instanceof TmuxSessionTreeItem) {
            if (!element.session || !element.session.windows) {
                return [];
            }
            return element.session.windows.map(win => new TmuxWindowTreeItem(win, this.extensionPath, element.session.isAttached));
        }

        if (element instanceof TmuxWindowTreeItem) {
            if (!element.window || !element.window.panes) {
                return [];
            }
            const sessionAttached = element.sessionAttached;
            return element.window.panes.map(pane => new TmuxPaneTreeItem(pane, this.extensionPath, sessionAttached, element.window.isActive));
        }

        return [];
    }
}

function getActivityPriorityColor(priority: ActivityPriority): string | undefined {
    switch (priority) {
        case ActivityPriority.AI_WORKING: return 'terminal.ansiGreen';
        case ActivityPriority.AI_WAITING: return 'terminal.ansiYellow';
        case ActivityPriority.BUILDING: return 'terminal.ansiYellow';
        case ActivityPriority.TESTING: return 'terminal.ansiCyan';
        case ActivityPriority.INSTALLING: return 'terminal.ansiMagenta';
        case ActivityPriority.RUNNING: return 'terminal.ansiGreen';
        default: return undefined;
    }
}

export class TmuxServerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly server: ServerIdentity,
        public readonly sessions: TmuxSession[],
        public readonly hasError: boolean = false
    ) {
        super(server.label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'tmuxServer';

        if (server.isLocal) {
            this.iconPath = new vscode.ThemeIcon('device-desktop');
        } else if (hasError) {
            this.iconPath = new vscode.ThemeIcon('remote', new vscode.ThemeColor('errorForeground'));
            this.description = 'connection error';
        } else {
            this.iconPath = new vscode.ThemeIcon('remote');
        }

        this.command = {
            command: 'tmux-agents.openServerTerminal',
            title: 'Open Server Terminal',
            arguments: [this]
        };

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Server:** ${server.label}\n\n`);
        if (!server.isLocal && server.sshConfig) {
            const cfg = server.sshConfig;
            tooltip.appendMarkdown(`**Host:** ${cfg.user ? cfg.user + '@' : ''}${cfg.host}${cfg.port && cfg.port !== 22 ? ':' + cfg.port : ''}\n\n`);
        }
        tooltip.appendMarkdown(`**Sessions:** ${sessions.length}`);
        this.tooltip = tooltip;
    }
}

export class TmuxSessionTreeItem extends vscode.TreeItem {
    constructor(public readonly session: TmuxSession) {
        const label = session.hotkey ? `[${session.hotkey}] ${session.name}` : session.name;
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'tmuxSession';
        this.iconPath = new vscode.ThemeIcon('server');

        // Activity-based coloring
        if (session.activitySummary && session.activitySummary.dominantPriority !== ActivityPriority.IDLE) {
            const color = getActivityPriorityColor(session.activitySummary.dominantPriority);
            if (color) {
                this.iconPath = new vscode.ThemeIcon('server', new vscode.ThemeColor(color));
            }
        } else if (session.isAttached) {
            this.iconPath = new vscode.ThemeIcon('server', new vscode.ThemeColor('terminal.ansiGreen'));
        }

        // Activity summary as description
        if (session.activitySummary && session.activitySummary.description) {
            this.description = session.activitySummary.description;
        }

        this.command = {
            command: 'tmux-agents.attach',
            title: 'Attach to Session',
            arguments: [this]
        };

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Session:** ${session.name}\n\n`);
        if (session.hotkey) {
            tooltip.appendMarkdown(`**Hotkey:** ${session.hotkey}\n\n`);
        }
        tooltip.appendMarkdown(`**Status:** ${session.isAttached ? 'Attached' : 'Detached'}\n\n`);
        if (session.created) {
            tooltip.appendMarkdown(`**Created:** ${new Date(parseInt(session.created) * 1000).toLocaleString()}\n\n`);
        }
        if (session.lastActivity) {
            tooltip.appendMarkdown(`**Last Activity:** ${new Date(parseInt(session.lastActivity) * 1000).toLocaleString()}\n\n`);
        }
        tooltip.appendMarkdown(`**Windows:** ${session.windows.length}`);
        if (session.activitySummary && session.activitySummary.description) {
            tooltip.appendMarkdown(`\n\n**Activity:** ${session.activitySummary.description}`);
        }
        this.tooltip = tooltip;
    }
}

export class TmuxWindowTreeItem extends vscode.TreeItem {
    public readonly sessionAttached: boolean;

    constructor(public readonly window: TmuxWindow, extensionPath: string, sessionAttached: boolean) {
        const label = window.hotkey
            ? `[${window.hotkey}] ${window.index}:${window.name}`
            : `${window.index}:${window.name}`;
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'tmuxWindow';
        this.sessionAttached = sessionAttached;
        this.iconPath = new vscode.ThemeIcon('window');

        // Activity-based coloring
        if (window.activitySummary && window.activitySummary.dominantPriority !== ActivityPriority.IDLE) {
            const color = getActivityPriorityColor(window.activitySummary.dominantPriority);
            if (color) {
                this.iconPath = new vscode.ThemeIcon('window', new vscode.ThemeColor(color));
            }
        } else if (window.isActive && sessionAttached) {
            this.iconPath = new vscode.ThemeIcon('window', new vscode.ThemeColor('terminal.ansiGreen'));
        }

        // Activity summary as description
        if (window.activitySummary && window.activitySummary.description) {
            this.description = window.activitySummary.description;
        } else if (window.isActive && sessionAttached) {
            this.description = '';
        } else if (window.isActive) {
            this.description = '';
        }

        this.command = {
            command: 'tmux-agents.attach',
            title: 'Attach to Window',
            arguments: [this]
        };

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Window:** ${window.index}:${window.name}\n\n`);
        if (window.hotkey) {
            tooltip.appendMarkdown(`**Hotkey:** ${window.hotkey}\n\n`);
        }
        tooltip.appendMarkdown(`**Status:** ${window.isActive ? 'Active' : 'Inactive'}\n\n`);
        tooltip.appendMarkdown(`**Session:** ${window.sessionName}\n\n`);
        tooltip.appendMarkdown(`**Panes:** ${window.panes.length}`);
        if (window.activitySummary && window.activitySummary.description) {
            tooltip.appendMarkdown(`\n\n**Activity:** ${window.activitySummary.description}`);
        }
        this.tooltip = tooltip;
    }
}

export class TmuxPaneTreeItem extends vscode.TreeItem {
    constructor(public readonly pane: TmuxPane, extensionPath: string, sessionAttached: boolean, windowActive: boolean) {
        const label = pane.hotkey
            ? `[${pane.hotkey}] ${pane.index}: ${pane.command}`
            : `${pane.index}: ${pane.command}`;
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'tmuxPane';

        if (pane.aiInfo) {
            // AI pane: use AI-specific icons and colors
            const iconName = AI_STATUS_ICONS[pane.aiInfo.status];
            const colorName = AI_STATUS_COLORS[pane.aiInfo.status];
            this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(colorName));
            // Show model in description when available from metadata
            const meta = pane.aiInfo.metadata;
            if (meta?.model) {
                this.description = `${pane.aiInfo.provider}/${meta.model} - ${pane.aiInfo.status}`;
            } else {
                this.description = `${pane.aiInfo.provider} - ${pane.aiInfo.status}`;
            }
        } else if (pane.processCategory && pane.processCategory !== ProcessCategory.IDLE) {
            // Non-idle process: use process category icons and colors
            const iconName = PROCESS_CATEGORY_ICONS[pane.processCategory];
            const colorName = PROCESS_CATEGORY_COLORS[pane.processCategory];
            this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(colorName));
            this.description = pane.processDescription;
        } else {
            // Default: use command-based icon
            const iconName = TmuxPaneTreeItem.getCommandIconName(pane.command);
            this.iconPath = new vscode.ThemeIcon(iconName);

            if (pane.isActive && windowActive && sessionAttached) {
                this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor('terminal.ansiGreen'));
            }
        }

        // Show working directory as description
        const cwd = pane.currentPath || '';
        if (cwd && cwd !== '~') {
            const shortPath = cwd.replace(/^\/Users\/[^/]+/, '~');
            this.description = this.description ? `${this.description}  ${shortPath}` : shortPath;
        }

        this.command = {
            command: 'tmux-agents.attach',
            title: 'Attach to Pane',
            arguments: [this]
        };

        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**Pane:** ${pane.index}\n\n`);
        if (pane.hotkey) {
            tooltip.appendMarkdown(`**Hotkey:** ${pane.hotkey}\n\n`);
        }
        tooltip.appendMarkdown(`**Command:** ${pane.command}\n\n`);
        tooltip.appendMarkdown(`**Status:** ${pane.isActive ? 'Active' : 'Inactive'}\n\n`);
        tooltip.appendMarkdown(`**Current Path:** ${pane.currentPath}\n\n`);
        if (pane.pid > 0) {
            tooltip.appendMarkdown(`**PID:** ${pane.pid}\n\n`);
        }
        if (pane.aiInfo) {
            tooltip.appendMarkdown(`**AI Provider:** ${pane.aiInfo.provider}\n\n`);
            tooltip.appendMarkdown(`**AI Status:** ${pane.aiInfo.status}\n\n`);
            const meta = pane.aiInfo.metadata;
            if (meta) {
                if (meta.model) { tooltip.appendMarkdown(`**Model:** ${meta.model}\n\n`); }
                if (meta.contextPct !== undefined) { tooltip.appendMarkdown(`**Context:** ${meta.contextPct}%\n\n`); }
                if (meta.cost !== undefined) { tooltip.appendMarkdown(`**Cost:** $${meta.cost.toFixed(4)}\n\n`); }
                if (meta.tokensIn !== undefined || meta.tokensOut !== undefined) {
                    tooltip.appendMarkdown(`**Tokens:** ${meta.tokensIn ?? 0} in / ${meta.tokensOut ?? 0} out\n\n`);
                }
                if (meta.linesAdded !== undefined || meta.linesRemoved !== undefined) {
                    tooltip.appendMarkdown(`**Lines:** +${meta.linesAdded ?? 0} / -${meta.linesRemoved ?? 0}\n\n`);
                }
                if (meta.gitBranch) { tooltip.appendMarkdown(`**Branch:** ${meta.gitBranch}\n\n`); }
                if (meta.version) { tooltip.appendMarkdown(`**Version:** ${meta.version}\n\n`); }
                if (meta.elapsed) { tooltip.appendMarkdown(`**Elapsed:** ${meta.elapsed}\n\n`); }
                if (meta.sessionId) { tooltip.appendMarkdown(`**Session:** ${meta.sessionId.slice(0, 8)}\n\n`); }
            }
        }
        if (pane.processCategory && pane.processCategory !== ProcessCategory.IDLE) {
            tooltip.appendMarkdown(`**Process:** ${pane.processDescription}\n\n`);
        }
        tooltip.appendMarkdown(`**Session:** ${pane.sessionName}\n\n`);
        tooltip.appendMarkdown(`**Window:** ${pane.windowIndex}`);
        this.tooltip = tooltip;
    }

    private static getCommandIconName(command: string): string {
        const cmd = command.toLowerCase();
        if (cmd.includes('vim') || cmd.includes('nvim')) return 'edit';
        if (cmd.includes('ssh')) return 'remote';
        if (cmd.includes('bash') || cmd.includes('zsh') || cmd.includes('sh')) return 'terminal-bash';
        if (cmd.includes('python') || cmd.includes('py')) return 'symbol-method';
        if (cmd.includes('node') || cmd.includes('npm')) return 'nodejs';
        if (cmd.includes('git')) return 'git-branch';
        if (cmd.includes('docker')) return 'server-environment';
        if (cmd.includes('htop') || cmd.includes('top')) return 'pulse';
        if (cmd.includes('tail') || cmd.includes('less') || cmd.includes('more')) return 'output';
        if (cmd.includes('mysql') || cmd.includes('psql')) return 'database';
        return 'terminal';
    }
}

export class HotkeyInfoTreeItem extends vscode.TreeItem {
    constructor(label: string, description: string, iconName: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor('disabledForeground'));
        this.contextValue = 'hotkeyInfo';
    }
}

export class ShortcutsProvider implements vscode.TreeDataProvider<HotkeyInfoTreeItem> {
    getTreeItem(element: HotkeyInfoTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): HotkeyInfoTreeItem[] {
        return [
            new HotkeyInfoTreeItem('T Hotkey  N New  C Claude  R Refresh', 'Ctrl+Alt+…', 'terminal'),
            new HotkeyInfoTreeItem('D Dashboard  K Kanban  G Graph  A Chat', 'Ctrl+Alt+…', 'dashboard'),
            new HotkeyInfoTreeItem('S Submit  P Spawn  E Team  M Send', 'Ctrl+Alt+…', 'rocket'),
            new HotkeyInfoTreeItem('F Fan-Out  L Pipeline  Q Coding  W Research', 'Ctrl+Alt+…', 'organization'),
            new HotkeyInfoTreeItem('Click to attach to any item', '', 'debug-start'),
        ];
    }
}

import { TmuxSession, ServerIdentity } from './types';
import { EventBus } from './eventBus';
export declare class TmuxService {
    private readonly server;
    private readonly execPrefix;
    private readonly eventBus?;
    private cache;
    private readonly CACHE_DURATION;
    private tmuxInstalled;
    constructor(server?: ServerIdentity, execPrefix?: string, eventBus?: EventBus | undefined);
    get serverId(): string;
    get serverLabel(): string;
    get serverIdentity(): ServerIdentity;
    private emitInfo;
    private emitWarning;
    private emitError;
    private buildSshArgs;
    /**
     * Build a command string, wrapping with SSH for remote servers.
     * Used for non-interactive exec() calls.
     */
    private buildCommand;
    /**
     * Build an SSH command for interactive terminal use (with -t for PTY allocation).
     * Returns the raw tmux command for local servers.
     */
    buildSshCommand(): string | null;
    buildTerminalCommand(tmuxCommand: string): string;
    /**
     * Get a display-friendly terminal name, prefixed with server label for remote.
     */
    getTerminalName(sessionName: string): string;
    resetConnectionState(): void;
    private checkTmuxInstallation;
    private isCacheValid;
    private getTmuxData;
    private parseTmuxData;
    getTmuxTree(): Promise<TmuxSession[]>;
    clearCache(): void;
    getTmuxTreeFresh(): Promise<TmuxSession[]>;
    getSessions(): Promise<string[]>;
    renameSession(oldName: string, newName: string): Promise<void>;
    renameWindow(sessionName: string, windowIndex: string, newName: string): Promise<void>;
    newSession(sessionName: string, options?: {
        cwd?: string;
        windowName?: string;
    }): Promise<void>;
    deleteSession(sessionName: string): Promise<void>;
    killWindow(sessionName: string, windowIndex: string): Promise<void>;
    killPane(sessionName: string, windowIndex: string, paneIndex: string): Promise<void>;
    selectWindow(sessionName: string, windowIndex: string): Promise<void>;
    selectPane(sessionName: string, windowIndex: string, paneIndex: string): Promise<void>;
    newWindow(sessionName: string, windowName?: string): Promise<void>;
    splitPane(targetPane: string, direction: 'h' | 'v'): Promise<void>;
    capturePaneContent(sessionName: string, windowIndex: string, paneIndex: string, lines?: number): Promise<string>;
    sendKeys(sessionName: string, windowIndex: string, paneIndex: string, keys: string): Promise<void>;
    sendKeysToSession(sessionName: string, keys: string): Promise<void>;
    sendRawKeys(sessionName: string, windowIndex: string, paneIndex: string, keys: string): Promise<void>;
    /**
     * Paste multi-line text into a pane using tmux load-buffer + paste-buffer.
     * Avoids shell escaping issues by piping text through stdin.
     */
    pasteText(sessionName: string, windowIndex: string, paneIndex: string, text: string): Promise<void>;
    hasSession(sessionName: string): Promise<boolean>;
    /**
     * Read all @cc_* pane options from a single pane.
     * Returns a map of option names (without @) to their values.
     */
    getPaneOptions(paneTarget: string): Promise<Record<string, string>>;
    /**
     * Batch-read @cc_* pane options for multiple panes in a single shell command.
     * Returns a Map of paneId → options record.
     */
    getMultiplePaneOptions(paneIds: string[]): Promise<Map<string, Record<string, string>>>;
    /**
     * Execute an arbitrary shell command on this server (local or remote).
     */
    execCommand(command: string): Promise<string>;
}
//# sourceMappingURL=tmuxService.d.ts.map
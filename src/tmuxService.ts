import * as cp from 'child_process';
import * as util from 'util';
import * as os from 'os';
import * as vscode from 'vscode';
import { TmuxSession, TmuxWindow, TmuxPane, ServerIdentity } from './types';

const exec = util.promisify(cp.exec);

interface CacheEntry {
    data: TmuxSession[];
    timestamp: number;
}

const LOCAL_SERVER: ServerIdentity = {
    id: 'local',
    label: 'Local',
    isLocal: true
};

export class TmuxService {
    private cache: CacheEntry | null = null;
    private readonly CACHE_DURATION = 2000; // 2 seconds
    private tmuxInstalled: boolean | null = null;

    constructor(private readonly server: ServerIdentity = LOCAL_SERVER) {}

    public get serverId(): string {
        return this.server.id;
    }

    public get serverLabel(): string {
        return this.server.label;
    }

    public get serverIdentity(): ServerIdentity {
        return this.server;
    }

    private buildSshArgs(sshConfig: NonNullable<ServerIdentity['sshConfig']>): string[] {
        const args: string[] = [];
        if (sshConfig.configFile) {
            const expandedConfig = sshConfig.configFile.replace(/^~/, os.homedir());
            args.push('-F', `"${expandedConfig}"`);
        }
        if (sshConfig.port && sshConfig.port !== 22) {
            args.push('-p', String(sshConfig.port));
        }
        const userHost = sshConfig.user ? `${sshConfig.user}@${sshConfig.host}` : sshConfig.host;
        args.push(userHost);
        return args;
    }

    /**
     * Build a command string, wrapping with SSH for remote servers.
     * Used for non-interactive exec() calls.
     */
    private buildCommand(tmuxCommand: string): string {
        if (this.server.isLocal) {
            return tmuxCommand;
        }

        const parts: string[] = ['ssh'];
        parts.push('-o', 'ConnectTimeout=5');
        parts.push('-o', 'StrictHostKeyChecking=accept-new');
        parts.push('-o', 'BatchMode=yes');
        parts.push(...this.buildSshArgs(this.server.sshConfig!));
        // Wrap in login shell so ~/.bash_profile / ~/.zprofile are sourced,
        // ensuring PATH includes directories like /opt/homebrew/bin
        const escaped = tmuxCommand.replace(/"/g, '\\"');
        parts.push(`'bash -lc "${escaped}"'`);

        return parts.join(' ');
    }

    /**
     * Build an SSH command for interactive terminal use (with -t for PTY allocation).
     * Returns the raw tmux command for local servers.
     */
    public buildSshCommand(): string | null {
        if (this.server.isLocal) {
            return null;
        }

        const parts: string[] = ['ssh', '-t'];
        parts.push(...this.buildSshArgs(this.server.sshConfig!));

        return parts.join(' ');
    }

    public buildTerminalCommand(tmuxCommand: string): string {
        if (this.server.isLocal) {
            return tmuxCommand;
        }

        const parts: string[] = ['ssh', '-t'];
        parts.push(...this.buildSshArgs(this.server.sshConfig!));
        // Wrap in login shell so PATH is fully set up on the remote
        const escaped = tmuxCommand.replace(/"/g, '\\"');
        parts.push(`'bash -lc "${escaped}"'`);

        return parts.join(' ');
    }

    /**
     * Get a display-friendly terminal name, prefixed with server label for remote.
     */
    public getTerminalName(sessionName: string): string {
        if (this.server.isLocal) {
            return sessionName;
        }
        return `${this.server.label}: ${sessionName}`;
    }

    public resetConnectionState(): void {
        this.tmuxInstalled = null;
        this.clearCache();
    }

    private async checkTmuxInstallation(): Promise<boolean> {
        if (this.tmuxInstalled !== null) {
            return this.tmuxInstalled;
        }

        try {
            await exec(this.buildCommand('tmux -V'));
            this.tmuxInstalled = true;
            return true;
        } catch (error) {
            this.tmuxInstalled = false;
            const target = this.server.isLocal
                ? ''
                : ` on ${this.server.label} (${this.server.sshConfig?.host})`;
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (!this.server.isLocal && errorMessage.includes('Connection refused')) {
                vscode.window.showErrorMessage(
                    `SSH connection refused${target}. Check that the host is reachable and SSH is running.`
                );
            } else if (!this.server.isLocal && errorMessage.includes('Permission denied')) {
                vscode.window.showErrorMessage(
                    `SSH authentication failed${target}. Check your SSH key or credentials.`
                );
            } else if (!this.server.isLocal && errorMessage.includes('timed out')) {
                vscode.window.showErrorMessage(
                    `SSH connection timed out${target}. The host may be unreachable.`
                );
            } else {
                vscode.window.showErrorMessage(
                    `tmux is not installed or not in PATH${target}. Please install tmux to use this extension.`
                );
            }
            return false;
        }
    }

    private isCacheValid(): boolean {
        return this.cache !== null && (Date.now() - this.cache.timestamp) < this.CACHE_DURATION;
    }

    private async getTmuxData(): Promise<TmuxSession[]> {
        try {
            const [sessionsOutput, windowsOutput, panesOutput] = await Promise.all([
                exec(this.buildCommand('tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_created}:#{session_activity}"')),
                exec(this.buildCommand('tmux list-windows -a -F "#{session_name}:#{window_index}:#{window_name}:#{window_active}"')),
                exec(this.buildCommand('tmux list-panes -a -F "#{session_name}:#{window_index}:#{pane_index}:#{pane_current_command}:#{pane_current_path}:#{pane_active}:#{pane_pid}"'))
            ]);

            return this.parseTmuxData(sessionsOutput.stdout, windowsOutput.stdout, panesOutput.stdout);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('no server running') || errorMessage.includes('no current target') || errorMessage.includes('no current client')) {
                return [];
            }
            vscode.window.showErrorMessage(`Failed to get tmux data: ${errorMessage}`);
            throw error;
        }
    }

    private parseTmuxData(sessionsData: string, windowsData: string, panesData: string): TmuxSession[] {
        const serverId = this.server.id;

        // Parse sessions
        const sessionsMap = new Map<string, TmuxSession>();
        if (sessionsData) {
            sessionsData.trim().split('\n').forEach(line => {
                const [name, attached, created, activity] = line.split(':');
                if (name) {
                    sessionsMap.set(name, {
                        serverId,
                        name,
                        isAttached: attached === '1',
                        created,
                        lastActivity: activity,
                        windows: []
                    });
                }
            });
        }

        // Parse panes
        const panesByWindow = new Map<string, TmuxPane[]>();
        if (panesData) {
            panesData.trim().split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 7) {
                    const [sessionName, windowIndex, paneIndex, paneCommand, currentPath, isActive, pid] = parts;
                    const key = `${sessionName}:${windowIndex}`;
                    if (!panesByWindow.has(key)) {
                        panesByWindow.set(key, []);
                    }
                    panesByWindow.get(key)!.push({
                        serverId,
                        sessionName,
                        windowIndex,
                        index: paneIndex,
                        command: paneCommand,
                        currentPath: currentPath || '~',
                        isActive: isActive === '1',
                        pid: parseInt(pid) || 0
                    });
                }
            });
        }

        // Parse windows
        const windowsBySession = new Map<string, TmuxWindow[]>();
        if (windowsData) {
            windowsData.trim().split('\n').forEach(line => {
                const [sessionName, windowIndex, windowName, isActive] = line.split(':');
                if (sessionName && windowIndex) {
                    const key = `${sessionName}:${windowIndex}`;
                    if (!windowsBySession.has(sessionName)) {
                        windowsBySession.set(sessionName, []);
                    }
                    windowsBySession.get(sessionName)!.push({
                        serverId,
                        sessionName,
                        index: windowIndex,
                        name: windowName,
                        isActive: isActive === '1',
                        panes: panesByWindow.get(key) || []
                    });
                }
            });
        }

        // Combine data
        const sessions: TmuxSession[] = [];
        sessionsMap.forEach(session => {
            session.windows = windowsBySession.get(session.name) || [];
            sessions.push(session);
        });

        return sessions;
    }

    public async getTmuxTree(): Promise<TmuxSession[]> {
        if (!await this.checkTmuxInstallation()) {
            return [];
        }

        if (this.isCacheValid()) {
            return this.cache!.data;
        }

        try {
            const data = await this.getTmuxData();
            this.cache = {
                data,
                timestamp: Date.now()
            };
            return data;
        } catch (error) {
            if (this.cache) {
                return this.cache.data;
            }
            return [];
        }
    }

    public clearCache(): void {
        this.cache = null;
    }

    public async getTmuxTreeFresh(): Promise<TmuxSession[]> {
        this.clearCache();
        return this.getTmuxTree();
    }

    public async getSessions(): Promise<string[]> {
        if (!await this.checkTmuxInstallation()) {
            return [];
        }

        try {
            const { stdout } = await exec(this.buildCommand('tmux ls -F "#{session_name}"'));
            if (stdout && stdout.trim()) {
                return stdout.trim().split('\n').filter(name => name.length > 0);
            }
            return [];
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('no server running') && !errorMessage.includes('no current target') && !errorMessage.includes('no current client')) {
                vscode.window.showWarningMessage(`Failed to get sessions: ${errorMessage}`);
            }
            return [];
        }
    }

    public async renameSession(oldName: string, newName: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux rename-session -t "${oldName}" "${newName}"`));
            this.clearCache();
            vscode.window.showInformationMessage(`Session renamed from "${oldName}" to "${newName}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to rename session "${oldName}" to "${newName}": ${errorMessage}`);
            throw error;
        }
    }

    public async renameWindow(sessionName: string, windowIndex: string, newName: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux rename-window -t "${sessionName}:${windowIndex}" "${newName}"`));
            this.clearCache();
            vscode.window.showInformationMessage(`Window ${windowIndex} renamed to "${newName}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                vscode.window.showErrorMessage(`Session "${sessionName}" not found`);
            } else if (errorMessage.includes('window not found')) {
                vscode.window.showErrorMessage(`Window ${windowIndex} not found in session "${sessionName}"`);
            } else {
                vscode.window.showErrorMessage(`Failed to rename window ${windowIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }

    public async newSession(sessionName: string, options?: { cwd?: string; windowName?: string }): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            throw new Error('tmux is not installed');
        }

        try {
            let cmd = `tmux new-session -d -s "${sessionName}"`;
            if (options?.windowName) {
                cmd += ` -n "${options.windowName}"`;
            }
            if (options?.cwd) {
                cmd += ` -c "${options.cwd}"`;
            }
            await exec(this.buildCommand(cmd));
            // Enable mouse mode so scrolling enters copy mode in VS Code terminals
            await exec(this.buildCommand(`tmux set-option -g mouse on`)).catch(() => {});
            this.clearCache();
            vscode.window.showInformationMessage(`Created new session "${sessionName}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('duplicate session')) {
                vscode.window.showErrorMessage(`Session "${sessionName}" already exists`);
            } else {
                vscode.window.showErrorMessage(`Failed to create session "${sessionName}": ${errorMessage}`);
            }
            throw error;
        }
    }

    public async deleteSession(sessionName: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux kill-session -t "${sessionName}"`));
            this.clearCache();
            vscode.window.showInformationMessage(`Deleted session "${sessionName}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                vscode.window.showWarningMessage(`Session "${sessionName}" not found`);
            } else {
                vscode.window.showErrorMessage(`Failed to delete session "${sessionName}": ${errorMessage}`);
            }
            throw error;
        }
    }

    public async killWindow(sessionName: string, windowIndex: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux kill-window -t "${sessionName}:${windowIndex}"`));
            this.clearCache();
            vscode.window.showInformationMessage(`Killed window ${windowIndex} in session "${sessionName}"`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('window not found')) {
                vscode.window.showWarningMessage(`Window ${windowIndex} not found in session "${sessionName}"`);
            } else {
                vscode.window.showErrorMessage(`Failed to kill window ${windowIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }

    public async killPane(sessionName: string, windowIndex: string, paneIndex: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux kill-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`));
            this.clearCache();
            vscode.window.showInformationMessage(`Killed pane ${paneIndex} in window ${windowIndex}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('pane not found')) {
                vscode.window.showWarningMessage(`Pane ${paneIndex} not found in window ${windowIndex}`);
            } else {
                vscode.window.showErrorMessage(`Failed to kill pane ${paneIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }

    public async selectWindow(sessionName: string, windowIndex: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux select-window -t "${sessionName}:${windowIndex}"`));
        } catch (error) {
            console.warn(`Failed to select window ${windowIndex}:`, error);
        }
    }

    public async selectPane(sessionName: string, windowIndex: string, paneIndex: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux select-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`));
        } catch (error) {
            console.warn(`Failed to select pane ${paneIndex}:`, error);
        }
    }

    public async newWindow(sessionName: string, windowName?: string): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            // Trailing colon ensures tmux interprets this as a session target,
            // not a window index (fixes ambiguity with numeric session names like "0")
            let command = `tmux new-window -t "${sessionName}:"`;
            if (windowName) {
                command += ` -n "${windowName}"`;
            }
            await exec(this.buildCommand(command));
            this.clearCache();

            const message = windowName
                ? `Created new window "${windowName}" in session "${sessionName}"`
                : `Created new window in session "${sessionName}"`;
            vscode.window.showInformationMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                vscode.window.showErrorMessage(`Session "${sessionName}" not found`);
            } else {
                vscode.window.showErrorMessage(`Failed to create new window: ${errorMessage}`);
            }
            throw error;
        }
    }

    public async splitPane(targetPane: string, direction: 'h' | 'v'): Promise<void> {
        if (!await this.checkTmuxInstallation()) {
            return;
        }

        try {
            await exec(this.buildCommand(`tmux split-window -t "${targetPane}" -${direction}`));
            this.clearCache();
            const directionText = direction === 'h' ? 'horizontally' : 'vertically';
            vscode.window.showInformationMessage(`Split pane ${directionText}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('pane not found')) {
                vscode.window.showErrorMessage(`Target pane ${targetPane} not found`);
            } else {
                vscode.window.showErrorMessage(`Failed to split pane: ${errorMessage}`);
            }
            throw error;
        }
    }

    public async capturePaneContent(sessionName: string, windowIndex: string, paneIndex: string, lines: number = 50): Promise<string> {
        try {
            const cmd = this.buildCommand(`tmux capture-pane -t "${sessionName}:${windowIndex}.${paneIndex}" -p -S -${lines}`);
            const { stdout } = await exec(cmd);
            return stdout;
        } catch (error) {
            return '';
        }
    }

    public async sendKeys(sessionName: string, windowIndex: string, paneIndex: string, keys: string): Promise<void> {
        try {
            const escaped = keys.replace(/"/g, '\\"');
            const cmd = this.buildCommand(`tmux send-keys -t "${sessionName}:${windowIndex}.${paneIndex}" "${escaped}" Enter`);
            await exec(cmd);
        } catch (error) {
            console.warn(`Failed to send keys to pane ${sessionName}:${windowIndex}.${paneIndex}:`, error);
        }
    }

    public async sendKeysToSession(sessionName: string, keys: string): Promise<void> {
        const escaped = keys.replace(/"/g, '\\"');
        const cmd = this.buildCommand(`tmux send-keys -t "${sessionName}" "${escaped}" Enter`);
        await exec(cmd);
    }

    /**
     * Execute an arbitrary shell command on this server (local or remote).
     */
    public async execCommand(command: string): Promise<string> {
        const cmd = this.buildCommand(command);
        const { stdout } = await exec(cmd, { timeout: 10000, maxBuffer: 512 * 1024 });
        return stdout;
    }
}

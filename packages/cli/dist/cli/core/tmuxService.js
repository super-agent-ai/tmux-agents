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
exports.TmuxService = void 0;
const cp = __importStar(require("child_process"));
const util = __importStar(require("util"));
const os = __importStar(require("os"));
const exec = util.promisify(cp.exec);
const LOCAL_SERVER = {
    id: 'local',
    label: 'Local',
    isLocal: true
};
class TmuxService {
    constructor(server = LOCAL_SERVER, execPrefix = '', eventBus) {
        this.server = server;
        this.execPrefix = execPrefix;
        this.eventBus = eventBus;
        this.cache = null;
        this.CACHE_DURATION = 2000; // 2 seconds
        this.tmuxInstalled = null;
    }
    get serverId() {
        return this.server.id;
    }
    get serverLabel() {
        return this.server.label;
    }
    get serverIdentity() {
        return this.server;
    }
    // ─── Event Emitters ──────────────────────────────────────────────────────
    emitInfo(message) {
        if (this.eventBus) {
            this.eventBus.emit('info', message);
        }
    }
    emitWarning(message) {
        if (this.eventBus) {
            this.eventBus.emit('warning', message);
        }
    }
    emitError(message) {
        if (this.eventBus) {
            this.eventBus.emit('error', message);
        }
    }
    // ─── SSH Command Building ────────────────────────────────────────────────
    buildSshArgs(sshConfig) {
        const args = [];
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
    buildCommand(tmuxCommand) {
        if (this.server.isLocal) {
            return tmuxCommand;
        }
        const parts = ['ssh'];
        parts.push('-o', 'ConnectTimeout=5');
        parts.push('-o', 'StrictHostKeyChecking=accept-new');
        parts.push('-o', 'BatchMode=yes');
        parts.push(...this.buildSshArgs(this.server.sshConfig));
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
    buildSshCommand() {
        if (this.server.isLocal) {
            return null;
        }
        const parts = ['ssh', '-t'];
        parts.push(...this.buildSshArgs(this.server.sshConfig));
        return parts.join(' ');
    }
    buildTerminalCommand(tmuxCommand) {
        if (this.server.isLocal) {
            return tmuxCommand;
        }
        const parts = ['ssh', '-t'];
        parts.push(...this.buildSshArgs(this.server.sshConfig));
        // Wrap in login shell so PATH is fully set up on the remote
        const escaped = tmuxCommand.replace(/"/g, '\\"');
        parts.push(`'bash -lc "${escaped}"'`);
        return parts.join(' ');
    }
    /**
     * Get a display-friendly terminal name, prefixed with server label for remote.
     */
    getTerminalName(sessionName) {
        if (this.server.isLocal) {
            return sessionName;
        }
        return `${this.server.label}: ${sessionName}`;
    }
    resetConnectionState() {
        this.tmuxInstalled = null;
        this.clearCache();
    }
    async checkTmuxInstallation() {
        if (this.tmuxInstalled !== null) {
            return this.tmuxInstalled;
        }
        try {
            await exec(this.buildCommand('tmux -V'));
            this.tmuxInstalled = true;
            return true;
        }
        catch (error) {
            this.tmuxInstalled = false;
            const target = this.server.isLocal
                ? ''
                : ` on ${this.server.label} (${this.server.sshConfig?.host})`;
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!this.server.isLocal && errorMessage.includes('Connection refused')) {
                this.emitError(`SSH connection refused${target}. Check that the host is reachable and SSH is running.`);
            }
            else if (!this.server.isLocal && errorMessage.includes('Permission denied')) {
                this.emitError(`SSH authentication failed${target}. Check your SSH key or credentials.`);
            }
            else if (!this.server.isLocal && errorMessage.includes('timed out')) {
                this.emitError(`SSH connection timed out${target}. The host may be unreachable.`);
            }
            else {
                this.emitError(`tmux is not installed or not in PATH${target}. Please install tmux to use this extension.`);
            }
            return false;
        }
    }
    isCacheValid() {
        return this.cache !== null && (Date.now() - this.cache.timestamp) < this.CACHE_DURATION;
    }
    async getTmuxData() {
        try {
            const [sessionsOutput, windowsOutput, panesOutput] = await Promise.all([
                exec(this.buildCommand('tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_created}:#{session_activity}"')),
                exec(this.buildCommand('tmux list-windows -a -F "#{session_name}:#{window_index}:#{window_name}:#{window_active}"')),
                exec(this.buildCommand('tmux list-panes -a -F "#{session_name}:#{window_index}:#{pane_index}:#{pane_current_command}:#{pane_current_path}:#{pane_active}:#{pane_pid}:#{pane_id}"'))
            ]);
            return this.parseTmuxData(sessionsOutput.stdout, windowsOutput.stdout, panesOutput.stdout);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('no server running') || errorMessage.includes('no current target') || errorMessage.includes('no current client')) {
                return [];
            }
            this.emitError(`Failed to get tmux data: ${errorMessage}`);
            throw error;
        }
    }
    parseTmuxData(sessionsData, windowsData, panesData) {
        const serverId = this.server.id;
        // Parse sessions
        const sessionsMap = new Map();
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
        const panesByWindow = new Map();
        if (panesData) {
            panesData.trim().split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 7) {
                    const [sessionName, windowIndex, paneIndex, paneCommand, currentPath, isActive, pid] = parts;
                    const paneId = parts.length >= 8 ? parts[7] : undefined;
                    const key = `${sessionName}:${windowIndex}`;
                    if (!panesByWindow.has(key)) {
                        panesByWindow.set(key, []);
                    }
                    panesByWindow.get(key).push({
                        serverId,
                        sessionName,
                        windowIndex,
                        index: paneIndex,
                        paneId: paneId || undefined,
                        command: paneCommand,
                        currentPath: currentPath || '~',
                        isActive: isActive === '1',
                        pid: parseInt(pid) || 0
                    });
                }
            });
        }
        // Parse windows
        const windowsBySession = new Map();
        if (windowsData) {
            windowsData.trim().split('\n').forEach(line => {
                const [sessionName, windowIndex, windowName, isActive] = line.split(':');
                if (sessionName && windowIndex) {
                    const key = `${sessionName}:${windowIndex}`;
                    if (!windowsBySession.has(sessionName)) {
                        windowsBySession.set(sessionName, []);
                    }
                    windowsBySession.get(sessionName).push({
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
        const sessions = [];
        sessionsMap.forEach(session => {
            session.windows = windowsBySession.get(session.name) || [];
            sessions.push(session);
        });
        return sessions;
    }
    async getTmuxTree() {
        if (!await this.checkTmuxInstallation()) {
            return [];
        }
        if (this.isCacheValid()) {
            return this.cache.data;
        }
        try {
            const data = await this.getTmuxData();
            this.cache = {
                data,
                timestamp: Date.now()
            };
            return data;
        }
        catch (error) {
            if (this.cache) {
                return this.cache.data;
            }
            return [];
        }
    }
    clearCache() {
        this.cache = null;
    }
    async getTmuxTreeFresh() {
        this.clearCache();
        return this.getTmuxTree();
    }
    async getSessions() {
        if (!await this.checkTmuxInstallation()) {
            return [];
        }
        try {
            const { stdout } = await exec(this.buildCommand('tmux ls -F "#{session_name}"'));
            if (stdout && stdout.trim()) {
                return stdout.trim().split('\n').filter(name => name.length > 0);
            }
            return [];
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('no server running') && !errorMessage.includes('no current target') && !errorMessage.includes('no current client')) {
                this.emitWarning(`Failed to get sessions: ${errorMessage}`);
            }
            return [];
        }
    }
    async renameSession(oldName, newName) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux rename-session -t "${oldName}" "${newName}"`));
            this.clearCache();
            this.emitInfo(`Session renamed from "${oldName}" to "${newName}"`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitError(`Failed to rename session "${oldName}" to "${newName}": ${errorMessage}`);
            throw error;
        }
    }
    async renameWindow(sessionName, windowIndex, newName) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux rename-window -t "${sessionName}:${windowIndex}" "${newName}"`));
            this.clearCache();
            this.emitInfo(`Window ${windowIndex} renamed to "${newName}"`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                this.emitError(`Session "${sessionName}" not found`);
            }
            else if (errorMessage.includes('window not found')) {
                this.emitError(`Window ${windowIndex} not found in session "${sessionName}"`);
            }
            else {
                this.emitError(`Failed to rename window ${windowIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }
    async newSession(sessionName, options) {
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
            await exec(this.buildCommand(`tmux set-option -g mouse on`)).catch(() => { });
            this.clearCache();
            this.emitInfo(`Created new session "${sessionName}"`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('duplicate session')) {
                this.emitError(`Session "${sessionName}" already exists`);
            }
            else {
                this.emitError(`Failed to create session "${sessionName}": ${errorMessage}`);
            }
            throw error;
        }
    }
    async deleteSession(sessionName) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux kill-session -t "${sessionName}"`));
            this.clearCache();
            this.emitInfo(`Deleted session "${sessionName}"`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                this.emitWarning(`Session "${sessionName}" not found`);
            }
            else {
                this.emitError(`Failed to delete session "${sessionName}": ${errorMessage}`);
            }
            throw error;
        }
    }
    async killWindow(sessionName, windowIndex) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux kill-window -t "${sessionName}:${windowIndex}"`));
            this.clearCache();
            this.emitInfo(`Killed window ${windowIndex} in session "${sessionName}"`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('window not found')) {
                this.emitWarning(`Window ${windowIndex} not found in session "${sessionName}"`);
            }
            else {
                this.emitError(`Failed to kill window ${windowIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }
    async killPane(sessionName, windowIndex, paneIndex) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux kill-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`));
            this.clearCache();
            this.emitInfo(`Killed pane ${paneIndex} in window ${windowIndex}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('pane not found')) {
                this.emitWarning(`Pane ${paneIndex} not found in window ${windowIndex}`);
            }
            else {
                this.emitError(`Failed to kill pane ${paneIndex}: ${errorMessage}`);
            }
            throw error;
        }
    }
    async selectWindow(sessionName, windowIndex) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux select-window -t "${sessionName}:${windowIndex}"`));
        }
        catch (error) {
            console.warn(`Failed to select window ${windowIndex}:`, error);
        }
    }
    async selectPane(sessionName, windowIndex, paneIndex) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux select-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`));
        }
        catch (error) {
            console.warn(`Failed to select pane ${paneIndex}:`, error);
        }
    }
    async newWindow(sessionName, windowName) {
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
            this.emitInfo(message);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('session not found')) {
                this.emitError(`Session "${sessionName}" not found`);
            }
            else {
                this.emitError(`Failed to create new window: ${errorMessage}`);
            }
            throw error;
        }
    }
    async splitPane(targetPane, direction) {
        if (!await this.checkTmuxInstallation()) {
            return;
        }
        try {
            await exec(this.buildCommand(`tmux split-window -t "${targetPane}" -${direction}`));
            this.clearCache();
            const directionText = direction === 'h' ? 'horizontally' : 'vertically';
            this.emitInfo(`Split pane ${directionText}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('pane not found')) {
                this.emitError(`Target pane ${targetPane} not found`);
            }
            else {
                this.emitError(`Failed to split pane: ${errorMessage}`);
            }
            throw error;
        }
    }
    async capturePaneContent(sessionName, windowIndex, paneIndex, lines = 50) {
        try {
            const cmd = this.buildCommand(`tmux capture-pane -t "${sessionName}:${windowIndex}.${paneIndex}" -p -S -${lines}`);
            const { stdout } = await exec(cmd);
            return stdout;
        }
        catch (error) {
            return '';
        }
    }
    async sendKeys(sessionName, windowIndex, paneIndex, keys) {
        try {
            const escaped = keys.replace(/"/g, '\\"');
            const cmd = this.buildCommand(`tmux send-keys -t "${sessionName}:${windowIndex}.${paneIndex}" "${escaped}" Enter`);
            await exec(cmd);
        }
        catch (error) {
            console.warn(`Failed to send keys to pane ${sessionName}:${windowIndex}.${paneIndex}:`, error);
        }
    }
    async sendKeysToSession(sessionName, keys) {
        const escaped = keys.replace(/"/g, '\\"');
        const cmd = this.buildCommand(`tmux send-keys -t "${sessionName}" "${escaped}" Enter`);
        await exec(cmd);
    }
    async sendRawKeys(sessionName, windowIndex, paneIndex, keys) {
        const cmd = this.buildCommand(`tmux send-keys -t "${sessionName}:${windowIndex}.${paneIndex}" ${keys}`);
        await exec(cmd);
    }
    /**
     * Paste multi-line text into a pane using tmux load-buffer + paste-buffer.
     * Avoids shell escaping issues by piping text through stdin.
     */
    async pasteText(sessionName, windowIndex, paneIndex, text) {
        const target = `${sessionName}:${windowIndex}.${paneIndex}`;
        // Load text into tmux buffer via stdin — no shell escaping needed
        const loadCmd = this.buildCommand('tmux load-buffer -');
        await new Promise((resolve, reject) => {
            const child = cp.exec(loadCmd, (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
            child.stdin?.write(text);
            child.stdin?.end();
        });
        // Paste the buffer into the target pane (respects bracketed paste mode)
        const pasteCmd = this.buildCommand(`tmux paste-buffer -t "${target}"`);
        await exec(pasteCmd);
    }
    async hasSession(sessionName) {
        const sessions = await this.getSessions();
        return sessions.includes(sessionName);
    }
    /**
     * Read all @cc_* pane options from a single pane.
     * Returns a map of option names (without @) to their values.
     */
    async getPaneOptions(paneTarget) {
        try {
            const cmd = this.buildCommand(`tmux show-options -p -t "${paneTarget}"`);
            const { stdout } = await exec(cmd);
            const result = {};
            for (const line of stdout.split('\n')) {
                const match = line.match(/^@(cc_\w+)\s+(.*)/);
                if (match) {
                    result[match[1]] = match[2];
                }
            }
            return result;
        }
        catch {
            return {};
        }
    }
    /**
     * Batch-read @cc_* pane options for multiple panes in a single shell command.
     * Returns a Map of paneId → options record.
     */
    async getMultiplePaneOptions(paneIds) {
        const resultMap = new Map();
        if (paneIds.length === 0) {
            return resultMap;
        }
        try {
            // Build a single command that reads all panes with delimiters
            const parts = paneIds.map(id => `echo "---${id}---" && tmux show-options -p -t "${id}" 2>/dev/null || true`);
            const batchCmd = this.buildCommand(parts.join(' && '));
            const { stdout } = await exec(batchCmd, { timeout: 10000 });
            let currentId = null;
            let currentOptions = {};
            for (const line of stdout.split('\n')) {
                const delimMatch = line.match(/^---(.+)---$/);
                if (delimMatch) {
                    if (currentId) {
                        resultMap.set(currentId, currentOptions);
                    }
                    currentId = delimMatch[1];
                    currentOptions = {};
                    continue;
                }
                if (currentId) {
                    const optMatch = line.match(/^@(cc_\w+)\s+(.*)/);
                    if (optMatch) {
                        currentOptions[optMatch[1]] = optMatch[2];
                    }
                }
            }
            // Flush last pane
            if (currentId) {
                resultMap.set(currentId, currentOptions);
            }
        }
        catch {
            // On error, return empty map
        }
        return resultMap;
    }
    /**
     * Execute an arbitrary shell command on this server (local or remote).
     */
    async execCommand(command) {
        const cmd = this.buildCommand(command);
        const { stdout } = await exec(cmd, { timeout: 10000, maxBuffer: 512 * 1024 });
        return stdout;
    }
}
exports.TmuxService = TmuxService;
//# sourceMappingURL=tmuxService.js.map
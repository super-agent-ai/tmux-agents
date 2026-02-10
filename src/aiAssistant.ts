import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { AIProvider, AIStatus, AISessionInfo, TmuxPane } from './types';
import { TmuxService } from './tmuxService';

const exec = util.promisify(cp.exec);

interface ProviderConfig {
    command: string;
    pipeCommand: string;
    args: string[];
    forkArgs: string[];
    env: Record<string, string>;
}

export class AIAssistantManager {

    /**
     * Read provider config from VS Code settings.
     */
    private normalizeArgs(raw: unknown): string[] {
        if (Array.isArray(raw)) { return raw.map(String); }
        if (typeof raw === 'string' && raw.trim()) { return raw.trim().split(/\s+/); }
        return [];
    }

    private getProviderConfig(provider: AIProvider): ProviderConfig {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const allProviders = cfg.get<Record<string, any>>('aiProviders') || {};
        const key = provider as string;
        const p = allProviders[key] || {};
        return {
            command: p.command || key,
            pipeCommand: p.pipeCommand || p.command || key,
            args: this.normalizeArgs(p.args),
            forkArgs: this.normalizeArgs(p.forkArgs),
            env: (p.env as Record<string, string>) || {},
        };
    }

    /**
     * Detect if a command corresponds to a known AI CLI provider.
     */
    detectAIProvider(command: string): AIProvider | null {
        const cmd = command.trim().toLowerCase();
        // Match the base command name (strip path prefixes)
        const base = cmd.split('/').pop() || cmd;

        // Check against configured commands
        for (const provider of Object.values(AIProvider)) {
            const config = this.getProviderConfig(provider);
            const configBase = config.command.split('/').pop()?.toLowerCase() || '';
            if (base === configBase || base.startsWith(configBase + ' ')) {
                return provider;
            }
        }

        // Fallback known aliases
        if (base === 'claude' || base === 'claude-code') {
            return AIProvider.CLAUDE;
        }
        if (base === 'gemini') {
            return AIProvider.GEMINI;
        }
        if (base === 'codex') {
            return AIProvider.CODEX;
        }

        return null;
    }

    /**
     * Analyze captured pane content to determine AI session status.
     */
    detectAIStatus(_provider: AIProvider, capturedContent: string): AIStatus {
        if (!capturedContent || capturedContent.trim().length === 0) {
            return AIStatus.IDLE;
        }

        const lines = capturedContent.split('\n');
        // Focus on the last few non-empty lines for status detection
        const recentLines = lines
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .slice(-10);

        if (recentLines.length === 0) {
            return AIStatus.IDLE;
        }

        const recentText = recentLines.join('\n');

        // Check for WAITING patterns first (prompt indicators)
        const waitingPatterns = [
            /❯/,
            />>>/,
            /waiting for input/i,
            /claude>/i,
            /Enter your/i,
            /Type your/i,
            // A line that is just ">" or ends with "> " as a prompt
            /^>\s*$/m,
            /\$\s*$/m,
        ];

        for (const pattern of waitingPatterns) {
            if (pattern.test(recentLines[recentLines.length - 1])) {
                return AIStatus.WAITING;
            }
        }

        // Check for WORKING patterns (spinners, active generation)
        const spinnerChars = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒';
        const asciiSpinner = /[|/\-\\]/;
        const workingKeywords = /\b(Thinking|Generating|Processing|Analyzing|Writing|Reading)\b/i;

        for (const line of recentLines) {
            // Check for unicode spinners
            for (const ch of spinnerChars) {
                if (line.includes(ch)) {
                    return AIStatus.WORKING;
                }
            }

            // Check for working keywords
            if (workingKeywords.test(line)) {
                return AIStatus.WORKING;
            }
        }

        // Check for ascii spinner only on the last line to avoid false positives
        const lastLine = recentLines[recentLines.length - 1];
        if (lastLine.length <= 5 && asciiSpinner.test(lastLine)) {
            return AIStatus.WORKING;
        }

        // Check for active text generation: long lines of recent output
        if (recentText.length > 500) {
            return AIStatus.WORKING;
        }

        return AIStatus.IDLE;
    }

    /**
     * Build the env export prefix string from config.
     */
    private buildEnvPrefix(env: Record<string, string>): string {
        const entries = Object.entries(env);
        if (entries.length === 0) { return ''; }
        return entries.map(([k, v]) => `${k}=${v}`).join(' ') + ' ';
    }

    /**
     * Get the CLI command to launch a given AI provider.
     */
    getLaunchCommand(provider: AIProvider, _cwd?: string): string {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        const parts = [envPrefix + config.command, ...config.args];
        return parts.join(' ');
    }

    /**
     * Get the command to fork/continue a session for a given AI provider.
     */
    getForkCommand(provider: AIProvider, _sessionName: string): string {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        const parts = [envPrefix + config.command, ...config.forkArgs];
        return parts.join(' ');
    }

    /**
     * Get spawn-friendly config for cp.spawn: { command, args, env }.
     */
    getSpawnConfig(provider: AIProvider): { command: string; args: string[]; env: Record<string, string>; cwd?: string; shell: boolean } {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const allProviders = cfg.get<Record<string, any>>('aiProviders') || {};
        const key = provider as string;
        const p = allProviders[key] || {};
        const config = this.getProviderConfig(provider);
        const cwd = p.defaultWorkingDirectory
            || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            || undefined;
        const shell = p.shell ?? true;
        return { command: config.pipeCommand, args: ['--print', '-'], env: config.env, cwd, shell };
    }

    /**
     * Enrich a TmuxPane with AI session info if it is running an AI CLI.
     * Returns a new copy of the pane (does not mutate the original).
     */
    enrichPane(pane: TmuxPane): TmuxPane {
        const provider = this.detectAIProvider(pane.command);
        if (!provider) {
            return { ...pane };
        }

        const status = pane.capturedContent
            ? this.detectAIStatus(provider, pane.capturedContent)
            : AIStatus.IDLE;

        const aiInfo: AISessionInfo = {
            provider,
            status,
            launchCommand: pane.command,
        };

        return { ...pane, aiInfo };
    }

    /**
     * Create a new tmux session and launch an AI CLI inside it.
     */
    async createAISession(
        provider: AIProvider,
        service: TmuxService,
        sessionName: string,
        cwd?: string,
    ): Promise<void> {
        await service.newSession(sessionName);

        const launchCmd = this.getLaunchCommand(provider, cwd);
        const target = `${sessionName}:0.0`;

        // If a cwd is specified, cd there first
        if (cwd) {
            await exec(`tmux send-keys -t "${target}" "cd ${cwd}" Enter`);
        }

        await exec(`tmux send-keys -t "${target}" "${launchCmd}" Enter`);
    }
}

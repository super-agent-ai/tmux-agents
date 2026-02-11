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

    // ─── Default / Fallback Provider Resolution ────────────────────────────

    /**
     * Return the default AI provider from settings.
     */
    getDefaultProvider(): AIProvider {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const raw = cfg.get<string>('defaultProvider') || 'claude';
        return (Object.values(AIProvider).includes(raw as AIProvider) ? raw : 'claude') as AIProvider;
    }

    /**
     * Return the fallback AI provider from settings.
     */
    getFallbackProvider(): AIProvider {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const raw = cfg.get<string>('fallbackProvider') || 'gemini';
        return (Object.values(AIProvider).includes(raw as AIProvider) ? raw : 'gemini') as AIProvider;
    }

    /**
     * Resolve the effective provider for a given context.
     * Priority: explicit override > lane provider > settings default.
     */
    resolveProvider(override?: AIProvider, laneProvider?: AIProvider): AIProvider {
        return override || laneProvider || this.getDefaultProvider();
    }

    /**
     * Resolve the effective model for a given context.
     * Priority: task model > lane model > undefined (CLI default).
     */
    resolveModel(taskModel?: string, laneModel?: string): string | undefined {
        return taskModel || laneModel || undefined;
    }

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
        if (base === 'opencode') {
            return AIProvider.OPENCODE;
        }
        if (base === 'cursor-agent' || base === 'cursor') {
            return AIProvider.CURSOR;
        }
        if (base === 'copilot' || base === 'github-copilot') {
            return AIProvider.COPILOT;
        }
        if (base === 'aider') {
            return AIProvider.AIDER;
        }
        if (base === 'amp' || base === 'ampcode') {
            return AIProvider.AMP;
        }
        if (base === 'cline') {
            return AIProvider.CLINE;
        }
        if (base === 'kiro-cli' || base === 'kiro') {
            return AIProvider.KIRO;
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
     * Get the CLI command to launch a provider interactively (no --print, no stdin pipe).
     * Suitable for running inside a tmux pane.
     */
    getInteractiveLaunchCommand(provider: AIProvider, model?: string): string {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        const args = config.args.filter(a => a !== '--print' && a !== '-');
        if (model) {
            if (provider === AIProvider.OPENCODE || provider === AIProvider.CLINE) {
                args.push('-m', model);
            } else if (provider === AIProvider.AMP || provider === AIProvider.KIRO) {
                // amp uses agent modes, kiro uses settings-based model selection
            } else {
                args.push('--model', model);
            }
        }
        const parts = [envPrefix + config.command, ...args];
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
    getSpawnConfig(provider: AIProvider, model?: string): { command: string; args: string[]; env: Record<string, string>; cwd?: string; shell: boolean } {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const allProviders = cfg.get<Record<string, any>>('aiProviders') || {};
        const key = provider as string;
        const p = allProviders[key] || {};
        const config = this.getProviderConfig(provider);
        const cwd = p.defaultWorkingDirectory
            || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            || undefined;
        const shell = p.shell ?? true;

        if (provider === AIProvider.OPENCODE) {
            const args = ['run'];
            if (model) { args.push('-m', model); }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.CURSOR) {
            const args: string[] = ['--print', '--output-format', 'text'];
            if (model) { args.push('--model', model); }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.COPILOT) {
            const args: string[] = ['-p', '-s'];
            if (model) { args.push('--model', model); }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.AIDER) {
            // aider uses --message "prompt" (not stdin), --model for model, --yes to auto-confirm
            const args: string[] = ['--yes'];
            if (model) { args.push('--model', model); }
            // --message flag + prompt are added by spawnStreaming
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.AMP) {
            // amp uses -x "prompt" for non-interactive execute mode
            const args: string[] = [];
            // amp uses agent modes (smart/rush/deep) not --model; no model flag
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.CLINE) {
            // cline uses -y for auto-approve (headless), prompt as positional arg
            const args: string[] = ['-y'];
            if (model) { args.push('-m', model); }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        if (provider === AIProvider.KIRO) {
            // kiro-cli uses chat subcommand, --no-interactive for single response, --trust-all-tools
            const args: string[] = ['chat', '--no-interactive', '--trust-all-tools'];
            // model is set via kiro-cli settings, no --model flag
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }

        // Default: claude, gemini, codex
        const args: string[] = [];
        if (model) { args.push('--model', model); }
        args.push('--print', '-');
        return { command: config.pipeCommand, args, env: config.env, cwd, shell };
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

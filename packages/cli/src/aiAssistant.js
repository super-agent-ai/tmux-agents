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
exports.AIAssistantManager = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const util = __importStar(require("util"));
const types_1 = require("./core/types");
const aiModels_1 = require("./core/aiModels");
const exec = util.promisify(cp.exec);
class AIAssistantManager {
    // ─── Default / Fallback Provider Resolution ────────────────────────────
    /**
     * Return the default AI provider from settings.
     */
    getDefaultProvider() {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const raw = cfg.get('defaultProvider') || 'claude';
        return (Object.values(types_1.AIProvider).includes(raw) ? raw : 'claude');
    }
    /**
     * Return the fallback AI provider from settings.
     */
    getFallbackProvider() {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const raw = cfg.get('fallbackProvider') || 'gemini';
        return (Object.values(types_1.AIProvider).includes(raw) ? raw : 'gemini');
    }
    /**
     * Resolve the effective provider for a given context.
     * Priority: explicit override > lane provider > settings default.
     */
    resolveProvider(override, laneProvider) {
        return override || laneProvider || this.getDefaultProvider();
    }
    /**
     * Resolve the effective model for a given context.
     * Priority: task model > lane model > undefined (CLI default).
     * Deprecated model aliases are automatically resolved to current identifiers.
     */
    resolveModel(taskModel, laneModel) {
        const raw = taskModel || laneModel || undefined;
        return raw ? (0, aiModels_1.resolveModelAlias)(raw) : undefined;
    }
    /**
     * Read provider config from VS Code settings.
     */
    normalizeArgs(raw) {
        if (Array.isArray(raw)) {
            return raw.map(String);
        }
        if (typeof raw === 'string' && raw.trim()) {
            return raw.trim().split(/\s+/);
        }
        return [];
    }
    getProviderConfig(provider) {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        const allProviders = cfg.get('aiProviders') || {};
        const key = provider;
        const p = allProviders[key] || {};
        return {
            command: p.command || key,
            pipeCommand: p.pipeCommand || p.command || key,
            args: this.normalizeArgs(p.args),
            forkArgs: this.normalizeArgs(p.forkArgs),
            resumeFlag: (typeof p.resumeFlag === 'string' && p.resumeFlag) ? p.resumeFlag : undefined,
            autoPilotFlags: this.normalizeArgs(p.autoPilotFlags),
            env: p.env || {},
            defaultWorkingDirectory: p.defaultWorkingDirectory || undefined,
            shell: p.shell ?? true,
        };
    }
    /**
     * Detect if a command corresponds to a known AI CLI provider.
     */
    detectAIProvider(command) {
        const cmd = command.trim().toLowerCase();
        // Match the base command name (strip path prefixes)
        const base = cmd.split('/').pop() || cmd;
        // Check against configured commands
        for (const provider of Object.values(types_1.AIProvider)) {
            const config = this.getProviderConfig(provider);
            const configBase = config.command.split('/').pop()?.toLowerCase() || '';
            if (base === configBase || base.startsWith(configBase + ' ')) {
                return provider;
            }
        }
        // Fallback known aliases
        if (base === 'claude' || base === 'claude-code') {
            return types_1.AIProvider.CLAUDE;
        }
        if (base === 'gemini') {
            return types_1.AIProvider.GEMINI;
        }
        if (base === 'codex') {
            return types_1.AIProvider.CODEX;
        }
        if (base === 'opencode') {
            return types_1.AIProvider.OPENCODE;
        }
        if (base === 'agent' || base === 'cursor-agent' || base === 'cursor') {
            return types_1.AIProvider.CURSOR;
        }
        if (base === 'copilot' || base === 'github-copilot') {
            return types_1.AIProvider.COPILOT;
        }
        if (base === 'aider') {
            return types_1.AIProvider.AIDER;
        }
        if (base === 'amp' || base === 'ampcode') {
            return types_1.AIProvider.AMP;
        }
        if (base === 'cline') {
            return types_1.AIProvider.CLINE;
        }
        if (base === 'kiro-cli' || base === 'kiro') {
            return types_1.AIProvider.KIRO;
        }
        return null;
    }
    /**
     * Analyze captured pane content to determine AI session status.
     */
    detectAIStatus(_provider, capturedContent) {
        if (!capturedContent || capturedContent.trim().length === 0) {
            return types_1.AIStatus.IDLE;
        }
        const lines = capturedContent.split('\n');
        // Focus on the last few non-empty lines for status detection
        const recentLines = lines
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .slice(-10);
        if (recentLines.length === 0) {
            return types_1.AIStatus.IDLE;
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
                return types_1.AIStatus.WAITING;
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
                    return types_1.AIStatus.WORKING;
                }
            }
            // Check for working keywords
            if (workingKeywords.test(line)) {
                return types_1.AIStatus.WORKING;
            }
        }
        // Check for ascii spinner only on the last line to avoid false positives
        const lastLine = recentLines[recentLines.length - 1];
        if (lastLine.length <= 5 && asciiSpinner.test(lastLine)) {
            return types_1.AIStatus.WORKING;
        }
        // Check for active text generation: long lines of recent output
        if (recentText.length > 500) {
            return types_1.AIStatus.WORKING;
        }
        return types_1.AIStatus.IDLE;
    }
    /**
     * Build the env export prefix string from config.
     */
    buildEnvPrefix(env) {
        const entries = Object.entries(env);
        if (entries.length === 0) {
            return '';
        }
        return entries.map(([k, v]) => `${k}=${v}`).join(' ') + ' ';
    }
    /**
     * Get the CLI command to launch a given AI provider.
     */
    getLaunchCommand(provider, _cwd) {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        const parts = [envPrefix + config.command, ...config.args];
        return parts.join(' ');
    }
    /**
     * Get the CLI command to launch a provider interactively (no --print, no stdin pipe).
     * Suitable for running inside a tmux pane.
     */
    /**
     * Return provider-specific auto-accept / auto-pilot CLI flags.
     * Reads from the user-configurable `autoPilotFlags` in provider settings.
     */
    getAutoPilotFlags(provider) {
        const config = this.getProviderConfig(provider);
        return config.autoPilotFlags;
    }
    getInteractiveLaunchCommand(provider, model, autoPilot) {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        const args = config.args.filter(a => a !== '--print' && a !== '-');
        const resolvedModel = model ? (0, aiModels_1.resolveModelAlias)(model) : undefined;
        if (resolvedModel) {
            if (provider === types_1.AIProvider.OPENCODE || provider === types_1.AIProvider.CLINE) {
                args.push('-m', resolvedModel);
            }
            else if (provider === types_1.AIProvider.AMP || provider === types_1.AIProvider.KIRO) {
                // amp uses agent modes, kiro uses settings-based model selection
            }
            else {
                args.push('--model', resolvedModel);
            }
        }
        if (autoPilot) {
            args.push(...this.getAutoPilotFlags(provider));
        }
        const parts = [envPrefix + config.command, ...args];
        return parts.join(' ');
    }
    /**
     * Get the command to fork/continue a session for a given AI provider.
     * When a ccSessionId is provided and the provider has a resumeFlag,
     * uses `command resumeFlag sessionId` to resume the specific session.
     * Otherwise falls back to the generic forkArgs (e.g. `--continue`).
     */
    getForkCommand(provider, _sessionName, ccSessionId) {
        const config = this.getProviderConfig(provider);
        const envPrefix = this.buildEnvPrefix(config.env);
        // If we have a specific session ID and the provider supports resume-by-ID
        if (ccSessionId && config.resumeFlag) {
            return [envPrefix + config.command, config.resumeFlag, ccSessionId].join(' ');
        }
        // Fall back to generic fork (e.g. --continue for most recent session)
        const parts = [envPrefix + config.command, ...config.forkArgs];
        return parts.join(' ');
    }
    /**
     * Get spawn-friendly config for cp.spawn: { command, args, env }.
     */
    getSpawnConfig(provider, model) {
        const config = this.getProviderConfig(provider);
        const cwd = config.defaultWorkingDirectory
            || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            || undefined;
        const shell = config.shell;
        // Resolve deprecated model aliases to current identifiers
        const resolvedModel = model ? (0, aiModels_1.resolveModelAlias)(model) : undefined;
        if (provider === types_1.AIProvider.OPENCODE) {
            const args = ['run'];
            if (resolvedModel) {
                args.push('-m', resolvedModel);
            }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.CURSOR) {
            const args = ['-p', '--output-format', 'text'];
            if (resolvedModel) {
                args.push('--model', resolvedModel);
            }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.COPILOT) {
            const args = ['-p', '-s'];
            if (resolvedModel) {
                args.push('--model', resolvedModel);
            }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.AIDER) {
            // aider uses --message "prompt" (not stdin), --model for model, --yes to auto-confirm
            const args = ['--yes'];
            if (resolvedModel) {
                args.push('--model', resolvedModel);
            }
            // --message flag + prompt are added by spawnStreaming
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.AMP) {
            // amp uses -x "prompt" for non-interactive execute mode
            const args = [];
            // amp uses agent modes (smart/rush/auto) not --model; no model flag
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.CLINE) {
            // cline uses -y for auto-approve (headless), prompt as positional arg
            const args = ['-y'];
            if (resolvedModel) {
                args.push('-m', resolvedModel);
            }
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        if (provider === types_1.AIProvider.KIRO) {
            // kiro-cli uses chat subcommand, --no-interactive for single response, --trust-all-tools
            const args = ['chat', '--no-interactive', '--trust-all-tools'];
            // model is set via kiro-cli settings, no --model flag
            return { command: config.pipeCommand, args, env: config.env, cwd, shell };
        }
        // Default: claude, gemini, codex
        const args = [];
        if (resolvedModel) {
            args.push('--model', resolvedModel);
        }
        args.push('--print', '-');
        return { command: config.pipeCommand, args, env: config.env, cwd, shell };
    }
    /**
     * Enrich a TmuxPane with AI session info if it is running an AI CLI.
     * Returns a new copy of the pane (does not mutate the original).
     */
    enrichPane(pane) {
        const provider = this.detectAIProvider(pane.command);
        if (!provider) {
            return { ...pane };
        }
        const status = pane.capturedContent
            ? this.detectAIStatus(provider, pane.capturedContent)
            : types_1.AIStatus.IDLE;
        const aiInfo = {
            provider,
            status,
            launchCommand: pane.command,
        };
        return { ...pane, aiInfo };
    }
    /**
     * Map a @cc_state value from hooks to an AIStatus.
     * Returns null if the state string is not recognized.
     */
    mapCcStateToAIStatus(ccState) {
        switch (ccState.toLowerCase()) {
            case 'busy':
                return types_1.AIStatus.WORKING;
            case 'user':
                return types_1.AIStatus.WAITING;
            case 'idle':
                return types_1.AIStatus.IDLE;
            default:
                return null;
        }
    }
    /**
     * Parse raw @cc_* option strings into a typed CcPaneMetadata object.
     */
    parseCcMetadata(options) {
        const parseNum = (key) => {
            const val = options[key];
            if (val === undefined || val === '') {
                return undefined;
            }
            const n = Number(val);
            return isNaN(n) ? undefined : n;
        };
        return {
            model: options['cc_model'] || undefined,
            sessionId: options['cc_session_id'] || undefined,
            cwd: options['cc_cwd'] || undefined,
            contextPct: parseNum('cc_context_pct'),
            cost: parseNum('cc_cost'),
            tokensIn: parseNum('cc_tokens_in'),
            tokensOut: parseNum('cc_tokens_out'),
            linesAdded: parseNum('cc_lines_added'),
            linesRemoved: parseNum('cc_lines_removed'),
            lastTool: options['cc_last_tool'] || undefined,
            agent: options['cc_agent'] || undefined,
            version: options['cc_version'] || undefined,
            gitBranch: options['cc_git_branch'] || undefined,
            outputStyle: options['cc_output_style'] || undefined,
            burnRate: parseNum('cc_burn_rate'),
            tokensRate: parseNum('cc_tokens_rate'),
            elapsed: options['cc_elapsed'] || undefined,
        };
    }
    /**
     * Enrich a TmuxPane using @cc_* pane options when available.
     * If cc_state is present, uses it as the authoritative status.
     * Otherwise falls back to the existing heuristic-based enrichPane().
     */
    enrichPaneWithOptions(pane, ccOptions) {
        const provider = this.detectAIProvider(pane.command);
        if (!provider) {
            return { ...pane };
        }
        const ccState = ccOptions['cc_state'];
        if (ccState) {
            const status = this.mapCcStateToAIStatus(ccState);
            if (status !== null) {
                const metadata = this.parseCcMetadata(ccOptions);
                const aiInfo = {
                    provider,
                    status,
                    launchCommand: pane.command,
                    metadata,
                };
                return { ...pane, aiInfo };
            }
        }
        // No cc_state or unrecognized value — fall back to heuristic
        return this.enrichPane(pane);
    }
    /**
     * Check whether the CLI binary for a provider is available on PATH.
     */
    isCliAvailable(provider) {
        const config = this.getProviderConfig(provider);
        try {
            cp.execSync(`which ${config.command}`, { stdio: 'ignore' });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Return the first available provider, checking default → fallback → all others.
     */
    getFirstAvailableProvider() {
        const defaultP = this.getDefaultProvider();
        if (this.isCliAvailable(defaultP)) {
            return defaultP;
        }
        const fallback = this.getFallbackProvider();
        if (fallback !== defaultP && this.isCliAvailable(fallback)) {
            return fallback;
        }
        for (const p of Object.values(types_1.AIProvider)) {
            if (p !== defaultP && p !== fallback && this.isCliAvailable(p)) {
                return p;
            }
        }
        return null;
    }
    /**
     * Create a new tmux session and launch an AI CLI inside it.
     */
    async createAISession(provider, service, sessionName, cwd) {
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
exports.AIAssistantManager = AIAssistantManager;
//# sourceMappingURL=aiAssistant.js.map
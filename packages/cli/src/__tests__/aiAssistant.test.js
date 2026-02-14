"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const aiAssistant_1 = require("../aiAssistant");
const types_1 = require("../core/types");
// Mock workspace.getConfiguration to return provider defaults
const mockGet = vitest_1.vi.fn(() => undefined);
vitest_1.vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vitest_1.vi.fn(() => ({ get: mockGet })),
        workspaceFolders: [{ uri: { fsPath: '/tmp/test-workspace' } }],
    },
    window: {
        showInformationMessage: vitest_1.vi.fn(),
        showErrorMessage: vitest_1.vi.fn(),
        showWarningMessage: vitest_1.vi.fn(),
    },
    EventEmitter: class {
        constructor() {
            this.fire = vitest_1.vi.fn();
            this.event = vitest_1.vi.fn();
            this.dispose = vitest_1.vi.fn();
        }
    },
}));
(0, vitest_1.describe)('AIAssistantManager', () => {
    let manager;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockGet.mockReturnValue(undefined);
        manager = new aiAssistant_1.AIAssistantManager();
    });
    // ─── detectAIProvider ────────────────────────────────────────────────
    (0, vitest_1.describe)('detectAIProvider', () => {
        (0, vitest_1.it)('detects claude command', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('claude')).toBe(types_1.AIProvider.CLAUDE);
        });
        (0, vitest_1.it)('detects claude-code alias', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('claude-code')).toBe(types_1.AIProvider.CLAUDE);
        });
        (0, vitest_1.it)('detects gemini command', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('gemini')).toBe(types_1.AIProvider.GEMINI);
        });
        (0, vitest_1.it)('detects codex command', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('codex')).toBe(types_1.AIProvider.CODEX);
        });
        (0, vitest_1.it)('returns null for unknown command', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('vim')).toBeNull();
        });
        (0, vitest_1.it)('handles command with path prefix', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('/usr/local/bin/claude')).toBe(types_1.AIProvider.CLAUDE);
        });
        (0, vitest_1.it)('is case insensitive', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('Claude')).toBe(types_1.AIProvider.CLAUDE);
        });
        (0, vitest_1.it)('handles whitespace', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('  claude  ')).toBe(types_1.AIProvider.CLAUDE);
        });
        (0, vitest_1.it)('returns null for empty string', () => {
            (0, vitest_1.expect)(manager.detectAIProvider('')).toBeNull();
        });
    });
    // ─── detectAIStatus ──────────────────────────────────────────────────
    (0, vitest_1.describe)('detectAIStatus', () => {
        (0, vitest_1.it)('returns IDLE for empty content', () => {
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, '')).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('returns IDLE for whitespace-only content', () => {
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, '   \n   \n')).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('detects WAITING when last line has prompt indicator', () => {
            const content = 'Some output\nMore output\n❯';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('detects WAITING for >>> prompt', () => {
            const content = 'Output\n>>>';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('detects WAITING for claude> prompt', () => {
            const content = 'Output\nclaude>';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('detects WAITING for shell prompt $', () => {
            const content = 'Some output\n$ ';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('detects WORKING for unicode spinner character', () => {
            const content = 'Processing...\n⠋ Loading';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WORKING);
        });
        (0, vitest_1.it)('detects WORKING for "Thinking" keyword', () => {
            const content = 'Analyzing code\nThinking about the problem';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WORKING);
        });
        (0, vitest_1.it)('detects WORKING for "Generating" keyword', () => {
            const content = 'Generating response...';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WORKING);
        });
        (0, vitest_1.it)('detects WORKING for long recent output (> 500 chars)', () => {
            const longContent = 'x'.repeat(600);
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, longContent)).toBe(types_1.AIStatus.WORKING);
        });
        (0, vitest_1.it)('returns IDLE for normal short output', () => {
            const content = 'Done.';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('detects WORKING for short ascii spinner on last line', () => {
            const content = 'Some output\n|';
            (0, vitest_1.expect)(manager.detectAIStatus(types_1.AIProvider.CLAUDE, content)).toBe(types_1.AIStatus.WORKING);
        });
    });
    // ─── getLaunchCommand ────────────────────────────────────────────────
    (0, vitest_1.describe)('getLaunchCommand', () => {
        (0, vitest_1.it)('returns default command for provider', () => {
            const cmd = manager.getLaunchCommand(types_1.AIProvider.CLAUDE);
            (0, vitest_1.expect)(cmd).toBe('claude');
        });
        (0, vitest_1.it)('returns default command for gemini', () => {
            const cmd = manager.getLaunchCommand(types_1.AIProvider.GEMINI);
            (0, vitest_1.expect)(cmd).toBe('gemini');
        });
        (0, vitest_1.it)('returns default command for codex', () => {
            const cmd = manager.getLaunchCommand(types_1.AIProvider.CODEX);
            (0, vitest_1.expect)(cmd).toBe('codex');
        });
    });
    // ─── getForkCommand ──────────────────────────────────────────────────
    (0, vitest_1.describe)('getForkCommand', () => {
        (0, vitest_1.it)('returns fork command for provider without session ID', () => {
            const cmd = manager.getForkCommand(types_1.AIProvider.CLAUDE, 'session-1');
            (0, vitest_1.expect)(cmd).toBe('claude');
        });
        (0, vitest_1.it)('uses resumeFlag with session ID when provided', () => {
            // Mock provider config with resumeFlag
            mockGet.mockImplementation((key) => {
                if (key === 'aiProviders') {
                    return {
                        claude: {
                            command: 'claude',
                            forkArgs: ['--continue'],
                            resumeFlag: '--resume',
                        },
                    };
                }
                return undefined;
            });
            const m = new aiAssistant_1.AIAssistantManager();
            const cmd = m.getForkCommand(types_1.AIProvider.CLAUDE, 'session-1', 'abc-123-def');
            (0, vitest_1.expect)(cmd).toBe('claude --resume abc-123-def');
        });
        (0, vitest_1.it)('falls back to forkArgs when no session ID provided', () => {
            mockGet.mockImplementation((key) => {
                if (key === 'aiProviders') {
                    return {
                        claude: {
                            command: 'claude',
                            forkArgs: ['--continue'],
                            resumeFlag: '--resume',
                        },
                    };
                }
                return undefined;
            });
            const m = new aiAssistant_1.AIAssistantManager();
            const cmd = m.getForkCommand(types_1.AIProvider.CLAUDE, 'session-1');
            (0, vitest_1.expect)(cmd).toBe('claude --continue');
        });
        (0, vitest_1.it)('falls back to forkArgs when resumeFlag is not configured', () => {
            mockGet.mockImplementation((key) => {
                if (key === 'aiProviders') {
                    return {
                        claude: {
                            command: 'claude',
                            forkArgs: ['--continue'],
                            // no resumeFlag
                        },
                    };
                }
                return undefined;
            });
            const m = new aiAssistant_1.AIAssistantManager();
            const cmd = m.getForkCommand(types_1.AIProvider.CLAUDE, 'session-1', 'some-id');
            (0, vitest_1.expect)(cmd).toBe('claude --continue');
        });
    });
    // ─── resolveModel ────────────────────────────────────────────────────
    (0, vitest_1.describe)('resolveModel', () => {
        (0, vitest_1.it)('returns task model when provided', () => {
            (0, vitest_1.expect)(manager.resolveModel('opus', 'sonnet')).toBe('opus');
        });
        (0, vitest_1.it)('falls back to lane model when task model is undefined', () => {
            (0, vitest_1.expect)(manager.resolveModel(undefined, 'sonnet')).toBe('sonnet');
        });
        (0, vitest_1.it)('returns undefined when neither is provided', () => {
            (0, vitest_1.expect)(manager.resolveModel(undefined, undefined)).toBeUndefined();
        });
        (0, vitest_1.it)('resolves deprecated model aliases', () => {
            (0, vitest_1.expect)(manager.resolveModel('gpt-5.3-codex')).toBe('o3');
        });
        (0, vitest_1.it)('resolves deprecated lane model aliases', () => {
            (0, vitest_1.expect)(manager.resolveModel(undefined, 'gemini-3-pro-preview')).toBe('gemini-2.5-pro');
        });
    });
    // ─── getSpawnConfig ─────────────────────────────────────────────────
    (0, vitest_1.describe)('getSpawnConfig', () => {
        (0, vitest_1.it)('returns spawn config for claude with model', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.CLAUDE, 'opus');
            (0, vitest_1.expect)(cfg.command).toBe('claude');
            (0, vitest_1.expect)(cfg.args).toContain('--model');
            (0, vitest_1.expect)(cfg.args).toContain('opus');
            (0, vitest_1.expect)(cfg.args).toContain('--print');
            (0, vitest_1.expect)(cfg.shell).toBe(true);
        });
        (0, vitest_1.it)('resolves deprecated model aliases in spawn config', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.CLAUDE, 'gpt-5.2');
            (0, vitest_1.expect)(cfg.args).toContain('gpt-4.1');
            (0, vitest_1.expect)(cfg.args).not.toContain('gpt-5.2');
        });
        (0, vitest_1.it)('returns spawn config for codex provider', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.CODEX, 'o3');
            (0, vitest_1.expect)(cfg.command).toBe('codex');
            (0, vitest_1.expect)(cfg.args).toContain('--model');
            (0, vitest_1.expect)(cfg.args).toContain('o3');
        });
        (0, vitest_1.it)('returns spawn config without model when model is undefined', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.CLAUDE);
            (0, vitest_1.expect)(cfg.args).not.toContain('--model');
            (0, vitest_1.expect)(cfg.args).toContain('--print');
        });
        (0, vitest_1.it)('returns spawn config for aider with --yes flag', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.AIDER, 'sonnet');
            (0, vitest_1.expect)(cfg.args).toContain('--yes');
            (0, vitest_1.expect)(cfg.args).toContain('--model');
            (0, vitest_1.expect)(cfg.args).toContain('sonnet');
        });
        (0, vitest_1.it)('returns spawn config for amp without model flag', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.AMP);
            (0, vitest_1.expect)(cfg.args).not.toContain('--model');
        });
        (0, vitest_1.it)('returns spawn config for kiro with chat subcommand', () => {
            const cfg = manager.getSpawnConfig(types_1.AIProvider.KIRO);
            (0, vitest_1.expect)(cfg.args).toContain('chat');
            (0, vitest_1.expect)(cfg.args).toContain('--no-interactive');
            (0, vitest_1.expect)(cfg.args).toContain('--trust-all-tools');
        });
    });
    // ─── enrichPane ──────────────────────────────────────────────────────
    (0, vitest_1.describe)('enrichPane', () => {
        (0, vitest_1.it)('returns pane with aiInfo when command is an AI provider', () => {
            const pane = {
                serverId: 'local',
                sessionName: 'test',
                windowIndex: '0',
                index: '0',
                command: 'claude',
                currentPath: '/tmp',
                isActive: true,
                pid: 123,
            };
            const enriched = manager.enrichPane(pane);
            (0, vitest_1.expect)(enriched.aiInfo).toBeDefined();
            (0, vitest_1.expect)(enriched.aiInfo.provider).toBe(types_1.AIProvider.CLAUDE);
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('returns pane without aiInfo for non-AI command', () => {
            const pane = {
                serverId: 'local',
                sessionName: 'test',
                windowIndex: '0',
                index: '0',
                command: 'vim',
                currentPath: '/tmp',
                isActive: true,
                pid: 456,
            };
            const enriched = manager.enrichPane(pane);
            (0, vitest_1.expect)(enriched.aiInfo).toBeUndefined();
        });
    });
    // ─── mapCcStateToAIStatus ───────────────────────────────────────────
    (0, vitest_1.describe)('mapCcStateToAIStatus', () => {
        (0, vitest_1.it)('maps busy to WORKING', () => {
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('busy')).toBe(types_1.AIStatus.WORKING);
        });
        (0, vitest_1.it)('maps user to WAITING', () => {
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('user')).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('maps idle to IDLE', () => {
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('idle')).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('is case insensitive', () => {
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('BUSY')).toBe(types_1.AIStatus.WORKING);
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('User')).toBe(types_1.AIStatus.WAITING);
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('IDLE')).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('returns null for unknown state', () => {
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('unknown')).toBeNull();
            (0, vitest_1.expect)(manager.mapCcStateToAIStatus('')).toBeNull();
        });
    });
    // ─── parseCcMetadata ────────────────────────────────────────────────
    (0, vitest_1.describe)('parseCcMetadata', () => {
        (0, vitest_1.it)('parses all string fields', () => {
            const opts = {
                cc_model: 'opus',
                cc_session_id: 'abc-123',
                cc_cwd: '/home/user',
                cc_last_tool: 'Read',
                cc_agent: 'main',
                cc_version: '1.0.0',
                cc_git_branch: 'feature-x',
                cc_output_style: 'concise',
                cc_elapsed: '5m30s',
            };
            const meta = manager.parseCcMetadata(opts);
            (0, vitest_1.expect)(meta.model).toBe('opus');
            (0, vitest_1.expect)(meta.sessionId).toBe('abc-123');
            (0, vitest_1.expect)(meta.cwd).toBe('/home/user');
            (0, vitest_1.expect)(meta.lastTool).toBe('Read');
            (0, vitest_1.expect)(meta.agent).toBe('main');
            (0, vitest_1.expect)(meta.version).toBe('1.0.0');
            (0, vitest_1.expect)(meta.gitBranch).toBe('feature-x');
            (0, vitest_1.expect)(meta.outputStyle).toBe('concise');
            (0, vitest_1.expect)(meta.elapsed).toBe('5m30s');
        });
        (0, vitest_1.it)('parses numeric fields', () => {
            const opts = {
                cc_context_pct: '42',
                cc_cost: '0.1234',
                cc_tokens_in: '50000',
                cc_tokens_out: '10000',
                cc_lines_added: '150',
                cc_lines_removed: '30',
                cc_burn_rate: '1.5678',
                cc_tokens_rate: '2500',
            };
            const meta = manager.parseCcMetadata(opts);
            (0, vitest_1.expect)(meta.contextPct).toBe(42);
            (0, vitest_1.expect)(meta.cost).toBe(0.1234);
            (0, vitest_1.expect)(meta.tokensIn).toBe(50000);
            (0, vitest_1.expect)(meta.tokensOut).toBe(10000);
            (0, vitest_1.expect)(meta.linesAdded).toBe(150);
            (0, vitest_1.expect)(meta.linesRemoved).toBe(30);
            (0, vitest_1.expect)(meta.burnRate).toBe(1.5678);
            (0, vitest_1.expect)(meta.tokensRate).toBe(2500);
        });
        (0, vitest_1.it)('returns undefined for missing fields', () => {
            const meta = manager.parseCcMetadata({});
            (0, vitest_1.expect)(meta.model).toBeUndefined();
            (0, vitest_1.expect)(meta.cost).toBeUndefined();
            (0, vitest_1.expect)(meta.contextPct).toBeUndefined();
        });
        (0, vitest_1.it)('handles non-numeric values gracefully', () => {
            const meta = manager.parseCcMetadata({ cc_cost: 'not-a-number' });
            (0, vitest_1.expect)(meta.cost).toBeUndefined();
        });
        (0, vitest_1.it)('handles empty string values', () => {
            const meta = manager.parseCcMetadata({ cc_model: '', cc_cost: '' });
            (0, vitest_1.expect)(meta.model).toBeUndefined();
            (0, vitest_1.expect)(meta.cost).toBeUndefined();
        });
    });
    // ─── enrichPaneWithOptions ──────────────────────────────────────────
    (0, vitest_1.describe)('enrichPaneWithOptions', () => {
        const basePaneClause = {
            serverId: 'local',
            sessionName: 'test',
            windowIndex: '0',
            index: '0',
            paneId: '%5',
            command: 'claude',
            currentPath: '/tmp',
            isActive: true,
            pid: 123,
        };
        (0, vitest_1.it)('uses cc_state as authoritative status when present', () => {
            const opts = { cc_state: 'busy', cc_model: 'opus', cc_cost: '0.5' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            (0, vitest_1.expect)(enriched.aiInfo).toBeDefined();
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.WORKING);
            (0, vitest_1.expect)(enriched.aiInfo.metadata).toBeDefined();
            (0, vitest_1.expect)(enriched.aiInfo.metadata.model).toBe('opus');
            (0, vitest_1.expect)(enriched.aiInfo.metadata.cost).toBe(0.5);
        });
        (0, vitest_1.it)('maps cc_state=user to WAITING', () => {
            const opts = { cc_state: 'user' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.WAITING);
        });
        (0, vitest_1.it)('maps cc_state=idle to IDLE', () => {
            const opts = { cc_state: 'idle' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.IDLE);
        });
        (0, vitest_1.it)('falls back to heuristic enrichPane when cc_state is absent', () => {
            const opts = { cc_model: 'opus' }; // no cc_state
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            (0, vitest_1.expect)(enriched.aiInfo).toBeDefined();
            // Without cc_state, falls back to heuristic which defaults to IDLE (no captured content)
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.IDLE);
            // No metadata since we fell back to heuristic
            (0, vitest_1.expect)(enriched.aiInfo.metadata).toBeUndefined();
        });
        (0, vitest_1.it)('returns pane without aiInfo for non-AI command', () => {
            const nonAiPane = { ...basePaneClause, command: 'vim' };
            const opts = { cc_state: 'busy' };
            const enriched = manager.enrichPaneWithOptions(nonAiPane, opts);
            (0, vitest_1.expect)(enriched.aiInfo).toBeUndefined();
        });
        (0, vitest_1.it)('falls back to heuristic for unrecognized cc_state', () => {
            const opts = { cc_state: 'unknown_state' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            // Unrecognized cc_state → falls back to heuristic
            (0, vitest_1.expect)(enriched.aiInfo.status).toBe(types_1.AIStatus.IDLE);
        });
    });
});
//# sourceMappingURL=aiAssistant.test.js.map
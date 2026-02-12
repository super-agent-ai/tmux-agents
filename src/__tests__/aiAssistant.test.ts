import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIAssistantManager } from '../aiAssistant';
import { AIProvider, AIStatus } from '../types';

// Mock workspace.getConfiguration to return provider defaults
const mockGet = vi.fn(() => undefined);
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({ get: mockGet })),
        workspaceFolders: [{ uri: { fsPath: '/tmp/test-workspace' } }],
    },
    window: {
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
    },
    EventEmitter: class { fire = vi.fn(); event = vi.fn(); dispose = vi.fn(); },
}));

describe('AIAssistantManager', () => {
    let manager: AIAssistantManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockReturnValue(undefined);
        manager = new AIAssistantManager();
    });

    // ─── detectAIProvider ────────────────────────────────────────────────

    describe('detectAIProvider', () => {
        it('detects claude command', () => {
            expect(manager.detectAIProvider('claude')).toBe(AIProvider.CLAUDE);
        });

        it('detects claude-code alias', () => {
            expect(manager.detectAIProvider('claude-code')).toBe(AIProvider.CLAUDE);
        });

        it('detects gemini command', () => {
            expect(manager.detectAIProvider('gemini')).toBe(AIProvider.GEMINI);
        });

        it('detects codex command', () => {
            expect(manager.detectAIProvider('codex')).toBe(AIProvider.CODEX);
        });

        it('returns null for unknown command', () => {
            expect(manager.detectAIProvider('vim')).toBeNull();
        });

        it('handles command with path prefix', () => {
            expect(manager.detectAIProvider('/usr/local/bin/claude')).toBe(AIProvider.CLAUDE);
        });

        it('is case insensitive', () => {
            expect(manager.detectAIProvider('Claude')).toBe(AIProvider.CLAUDE);
        });

        it('handles whitespace', () => {
            expect(manager.detectAIProvider('  claude  ')).toBe(AIProvider.CLAUDE);
        });

        it('returns null for empty string', () => {
            expect(manager.detectAIProvider('')).toBeNull();
        });
    });

    // ─── detectAIStatus ──────────────────────────────────────────────────

    describe('detectAIStatus', () => {
        it('returns IDLE for empty content', () => {
            expect(manager.detectAIStatus(AIProvider.CLAUDE, '')).toBe(AIStatus.IDLE);
        });

        it('returns IDLE for whitespace-only content', () => {
            expect(manager.detectAIStatus(AIProvider.CLAUDE, '   \n   \n')).toBe(AIStatus.IDLE);
        });

        it('detects WAITING when last line has prompt indicator', () => {
            const content = 'Some output\nMore output\n❯';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WAITING);
        });

        it('detects WAITING for >>> prompt', () => {
            const content = 'Output\n>>>';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WAITING);
        });

        it('detects WAITING for claude> prompt', () => {
            const content = 'Output\nclaude>';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WAITING);
        });

        it('detects WAITING for shell prompt $', () => {
            const content = 'Some output\n$ ';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WAITING);
        });

        it('detects WORKING for unicode spinner character', () => {
            const content = 'Processing...\n⠋ Loading';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WORKING);
        });

        it('detects WORKING for "Thinking" keyword', () => {
            const content = 'Analyzing code\nThinking about the problem';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WORKING);
        });

        it('detects WORKING for "Generating" keyword', () => {
            const content = 'Generating response...';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WORKING);
        });

        it('detects WORKING for long recent output (> 500 chars)', () => {
            const longContent = 'x'.repeat(600);
            expect(manager.detectAIStatus(AIProvider.CLAUDE, longContent)).toBe(AIStatus.WORKING);
        });

        it('returns IDLE for normal short output', () => {
            const content = 'Done.';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.IDLE);
        });

        it('detects WORKING for short ascii spinner on last line', () => {
            const content = 'Some output\n|';
            expect(manager.detectAIStatus(AIProvider.CLAUDE, content)).toBe(AIStatus.WORKING);
        });
    });

    // ─── getLaunchCommand ────────────────────────────────────────────────

    describe('getLaunchCommand', () => {
        it('returns default command for provider', () => {
            const cmd = manager.getLaunchCommand(AIProvider.CLAUDE);
            expect(cmd).toBe('claude');
        });

        it('returns default command for gemini', () => {
            const cmd = manager.getLaunchCommand(AIProvider.GEMINI);
            expect(cmd).toBe('gemini');
        });

        it('returns default command for codex', () => {
            const cmd = manager.getLaunchCommand(AIProvider.CODEX);
            expect(cmd).toBe('codex');
        });
    });

    // ─── getForkCommand ──────────────────────────────────────────────────

    describe('getForkCommand', () => {
        it('returns fork command for provider without session ID', () => {
            const cmd = manager.getForkCommand(AIProvider.CLAUDE, 'session-1');
            expect(cmd).toBe('claude');
        });

        it('uses resumeFlag with session ID when provided', () => {
            // Mock provider config with resumeFlag
            mockGet.mockImplementation((key: string) => {
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
            const m = new AIAssistantManager();
            const cmd = m.getForkCommand(AIProvider.CLAUDE, 'session-1', 'abc-123-def');
            expect(cmd).toBe('claude --resume abc-123-def');
        });

        it('falls back to forkArgs when no session ID provided', () => {
            mockGet.mockImplementation((key: string) => {
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
            const m = new AIAssistantManager();
            const cmd = m.getForkCommand(AIProvider.CLAUDE, 'session-1');
            expect(cmd).toBe('claude --continue');
        });

        it('falls back to forkArgs when resumeFlag is not configured', () => {
            mockGet.mockImplementation((key: string) => {
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
            const m = new AIAssistantManager();
            const cmd = m.getForkCommand(AIProvider.CLAUDE, 'session-1', 'some-id');
            expect(cmd).toBe('claude --continue');
        });
    });

    // ─── resolveModel ────────────────────────────────────────────────────

    describe('resolveModel', () => {
        it('returns task model when provided', () => {
            expect(manager.resolveModel('opus', 'sonnet')).toBe('opus');
        });

        it('falls back to lane model when task model is undefined', () => {
            expect(manager.resolveModel(undefined, 'sonnet')).toBe('sonnet');
        });

        it('returns undefined when neither is provided', () => {
            expect(manager.resolveModel(undefined, undefined)).toBeUndefined();
        });

        it('resolves deprecated model aliases', () => {
            expect(manager.resolveModel('gpt-5.3-codex')).toBe('o3');
        });

        it('resolves deprecated lane model aliases', () => {
            expect(manager.resolveModel(undefined, 'gemini-3-pro-preview')).toBe('gemini-2.5-pro');
        });
    });

    // ─── getSpawnConfig ─────────────────────────────────────────────────

    describe('getSpawnConfig', () => {
        it('returns spawn config for claude with model', () => {
            const cfg = manager.getSpawnConfig(AIProvider.CLAUDE, 'opus');
            expect(cfg.command).toBe('claude');
            expect(cfg.args).toContain('--model');
            expect(cfg.args).toContain('opus');
            expect(cfg.args).toContain('--print');
            expect(cfg.shell).toBe(true);
        });

        it('resolves deprecated model aliases in spawn config', () => {
            const cfg = manager.getSpawnConfig(AIProvider.CLAUDE, 'gpt-5.2');
            expect(cfg.args).toContain('gpt-4.1');
            expect(cfg.args).not.toContain('gpt-5.2');
        });

        it('returns spawn config for codex provider', () => {
            const cfg = manager.getSpawnConfig(AIProvider.CODEX, 'o3');
            expect(cfg.command).toBe('codex');
            expect(cfg.args).toContain('--model');
            expect(cfg.args).toContain('o3');
        });

        it('returns spawn config without model when model is undefined', () => {
            const cfg = manager.getSpawnConfig(AIProvider.CLAUDE);
            expect(cfg.args).not.toContain('--model');
            expect(cfg.args).toContain('--print');
        });

        it('returns spawn config for aider with --yes flag', () => {
            const cfg = manager.getSpawnConfig(AIProvider.AIDER, 'sonnet');
            expect(cfg.args).toContain('--yes');
            expect(cfg.args).toContain('--model');
            expect(cfg.args).toContain('sonnet');
        });

        it('returns spawn config for amp without model flag', () => {
            const cfg = manager.getSpawnConfig(AIProvider.AMP);
            expect(cfg.args).not.toContain('--model');
        });

        it('returns spawn config for kiro with chat subcommand', () => {
            const cfg = manager.getSpawnConfig(AIProvider.KIRO);
            expect(cfg.args).toContain('chat');
            expect(cfg.args).toContain('--no-interactive');
            expect(cfg.args).toContain('--trust-all-tools');
        });
    });

    // ─── enrichPane ──────────────────────────────────────────────────────

    describe('enrichPane', () => {
        it('returns pane with aiInfo when command is an AI provider', () => {
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
            expect(enriched.aiInfo).toBeDefined();
            expect(enriched.aiInfo!.provider).toBe(AIProvider.CLAUDE);
            expect(enriched.aiInfo!.status).toBe(AIStatus.IDLE);
        });

        it('returns pane without aiInfo for non-AI command', () => {
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
            expect(enriched.aiInfo).toBeUndefined();
        });
    });

    // ─── mapCcStateToAIStatus ───────────────────────────────────────────

    describe('mapCcStateToAIStatus', () => {
        it('maps busy to WORKING', () => {
            expect(manager.mapCcStateToAIStatus('busy')).toBe(AIStatus.WORKING);
        });

        it('maps user to WAITING', () => {
            expect(manager.mapCcStateToAIStatus('user')).toBe(AIStatus.WAITING);
        });

        it('maps idle to IDLE', () => {
            expect(manager.mapCcStateToAIStatus('idle')).toBe(AIStatus.IDLE);
        });

        it('is case insensitive', () => {
            expect(manager.mapCcStateToAIStatus('BUSY')).toBe(AIStatus.WORKING);
            expect(manager.mapCcStateToAIStatus('User')).toBe(AIStatus.WAITING);
            expect(manager.mapCcStateToAIStatus('IDLE')).toBe(AIStatus.IDLE);
        });

        it('returns null for unknown state', () => {
            expect(manager.mapCcStateToAIStatus('unknown')).toBeNull();
            expect(manager.mapCcStateToAIStatus('')).toBeNull();
        });
    });

    // ─── parseCcMetadata ────────────────────────────────────────────────

    describe('parseCcMetadata', () => {
        it('parses all string fields', () => {
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
            expect(meta.model).toBe('opus');
            expect(meta.sessionId).toBe('abc-123');
            expect(meta.cwd).toBe('/home/user');
            expect(meta.lastTool).toBe('Read');
            expect(meta.agent).toBe('main');
            expect(meta.version).toBe('1.0.0');
            expect(meta.gitBranch).toBe('feature-x');
            expect(meta.outputStyle).toBe('concise');
            expect(meta.elapsed).toBe('5m30s');
        });

        it('parses numeric fields', () => {
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
            expect(meta.contextPct).toBe(42);
            expect(meta.cost).toBe(0.1234);
            expect(meta.tokensIn).toBe(50000);
            expect(meta.tokensOut).toBe(10000);
            expect(meta.linesAdded).toBe(150);
            expect(meta.linesRemoved).toBe(30);
            expect(meta.burnRate).toBe(1.5678);
            expect(meta.tokensRate).toBe(2500);
        });

        it('returns undefined for missing fields', () => {
            const meta = manager.parseCcMetadata({});
            expect(meta.model).toBeUndefined();
            expect(meta.cost).toBeUndefined();
            expect(meta.contextPct).toBeUndefined();
        });

        it('handles non-numeric values gracefully', () => {
            const meta = manager.parseCcMetadata({ cc_cost: 'not-a-number' });
            expect(meta.cost).toBeUndefined();
        });

        it('handles empty string values', () => {
            const meta = manager.parseCcMetadata({ cc_model: '', cc_cost: '' });
            expect(meta.model).toBeUndefined();
            expect(meta.cost).toBeUndefined();
        });
    });

    // ─── enrichPaneWithOptions ──────────────────────────────────────────

    describe('enrichPaneWithOptions', () => {
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

        it('uses cc_state as authoritative status when present', () => {
            const opts = { cc_state: 'busy', cc_model: 'opus', cc_cost: '0.5' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            expect(enriched.aiInfo).toBeDefined();
            expect(enriched.aiInfo!.status).toBe(AIStatus.WORKING);
            expect(enriched.aiInfo!.metadata).toBeDefined();
            expect(enriched.aiInfo!.metadata!.model).toBe('opus');
            expect(enriched.aiInfo!.metadata!.cost).toBe(0.5);
        });

        it('maps cc_state=user to WAITING', () => {
            const opts = { cc_state: 'user' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            expect(enriched.aiInfo!.status).toBe(AIStatus.WAITING);
        });

        it('maps cc_state=idle to IDLE', () => {
            const opts = { cc_state: 'idle' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            expect(enriched.aiInfo!.status).toBe(AIStatus.IDLE);
        });

        it('falls back to heuristic enrichPane when cc_state is absent', () => {
            const opts = { cc_model: 'opus' };  // no cc_state
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            expect(enriched.aiInfo).toBeDefined();
            // Without cc_state, falls back to heuristic which defaults to IDLE (no captured content)
            expect(enriched.aiInfo!.status).toBe(AIStatus.IDLE);
            // No metadata since we fell back to heuristic
            expect(enriched.aiInfo!.metadata).toBeUndefined();
        });

        it('returns pane without aiInfo for non-AI command', () => {
            const nonAiPane = { ...basePaneClause, command: 'vim' };
            const opts = { cc_state: 'busy' };
            const enriched = manager.enrichPaneWithOptions(nonAiPane, opts);
            expect(enriched.aiInfo).toBeUndefined();
        });

        it('falls back to heuristic for unrecognized cc_state', () => {
            const opts = { cc_state: 'unknown_state' };
            const enriched = manager.enrichPaneWithOptions(basePaneClause, opts);
            // Unrecognized cc_state → falls back to heuristic
            expect(enriched.aiInfo!.status).toBe(AIStatus.IDLE);
        });
    });
});

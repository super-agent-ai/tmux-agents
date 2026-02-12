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
        it('returns fork command for provider', () => {
            const cmd = manager.getForkCommand(AIProvider.CLAUDE, 'session-1');
            expect(cmd).toBe('claude');
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
});

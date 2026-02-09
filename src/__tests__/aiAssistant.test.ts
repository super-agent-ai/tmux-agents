import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIAssistantManager } from '../aiAssistant';
import { AIProvider, AIStatus } from '../types';

// Mock workspace.getConfiguration to return provider defaults
const mockGet = vi.fn(() => undefined);
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({ get: mockGet })),
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

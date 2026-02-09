import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TmuxService } from '../tmuxService';
import { ServerIdentity } from '../types';

const { mockExec } = vi.hoisted(() => {
    const mockExec = vi.fn();
    return { mockExec };
});

vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

vi.mock('util', () => ({
    promisify: () => mockExec,
}));

const LOCAL_SERVER: ServerIdentity = {
    id: 'local',
    label: 'Local',
    isLocal: true,
};

const REMOTE_SERVER: ServerIdentity = {
    id: 'remote:mybox',
    label: 'My Box',
    isLocal: false,
    sshConfig: {
        label: 'My Box',
        host: 'mybox.example.com',
        port: 2222,
        user: 'deploy',
        identityFile: '/home/user/.ssh/id_ed25519',
        configFile: '/home/user/.ssh/config_custom',
    },
};

const REMOTE_SERVER_MINIMAL: ServerIdentity = {
    id: 'remote:simple',
    label: 'Simple',
    isLocal: false,
    sshConfig: {
        label: 'Simple',
        host: 'simple.example.com',
    },
};

describe('TmuxService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── buildSshCommand ─────────────────────────────────────────────────

    describe('buildSshCommand', () => {
        it('returns null for local server', () => {
            const service = new TmuxService(LOCAL_SERVER);
            expect(service.buildSshCommand()).toBeNull();
        });

        it('builds SSH command with all options for remote server', () => {
            const service = new TmuxService(REMOTE_SERVER);
            const result = service.buildSshCommand()!;
            expect(result).toContain('ssh -t');
            expect(result).toContain('-F');
            expect(result).toContain('-i');
            expect(result).toContain('-p 2222');
            expect(result).toContain('deploy@mybox.example.com');
        });

        it('builds SSH command with minimal options', () => {
            const service = new TmuxService(REMOTE_SERVER_MINIMAL);
            const result = service.buildSshCommand()!;
            expect(result).toBe('ssh -t simple.example.com');
        });

        it('omits port when port is 22', () => {
            const server: ServerIdentity = {
                id: 'remote:p22',
                label: 'P22',
                isLocal: false,
                sshConfig: { label: 'P22', host: 'host.com', port: 22 },
            };
            const service = new TmuxService(server);
            const result = service.buildSshCommand()!;
            expect(result).not.toContain('-p');
        });
    });

    // ─── buildTerminalCommand ────────────────────────────────────────────

    describe('buildTerminalCommand', () => {
        it('returns raw tmux command for local server', () => {
            const service = new TmuxService(LOCAL_SERVER);
            expect(service.buildTerminalCommand('tmux attach -t foo')).toBe('tmux attach -t foo');
        });

        it('wraps command in SSH for remote server', () => {
            const service = new TmuxService(REMOTE_SERVER);
            const result = service.buildTerminalCommand('tmux attach -t foo');
            expect(result).toContain('ssh -t');
            expect(result).toContain('deploy@mybox.example.com');
            expect(result).toContain('bash -lc');
            expect(result).toContain('tmux attach -t foo');
        });

        it('includes SSH args in terminal command', () => {
            const service = new TmuxService(REMOTE_SERVER);
            const result = service.buildTerminalCommand('tmux ls');
            expect(result).toContain('-F');
            expect(result).toContain('-i');
            expect(result).toContain('-p 2222');
        });
    });

    // ─── getTerminalName ─────────────────────────────────────────────────

    describe('getTerminalName', () => {
        it('returns session name for local server', () => {
            const service = new TmuxService(LOCAL_SERVER);
            expect(service.getTerminalName('my-session')).toBe('my-session');
        });

        it('prefixes with server label for remote server', () => {
            const service = new TmuxService(REMOTE_SERVER);
            expect(service.getTerminalName('my-session')).toBe('My Box: my-session');
        });
    });

    // ─── Server identity getters ─────────────────────────────────────────

    describe('server identity', () => {
        it('returns correct serverId', () => {
            const service = new TmuxService(REMOTE_SERVER);
            expect(service.serverId).toBe('remote:mybox');
        });

        it('returns correct serverLabel', () => {
            const service = new TmuxService(REMOTE_SERVER);
            expect(service.serverLabel).toBe('My Box');
        });

        it('returns correct serverIdentity', () => {
            const service = new TmuxService(REMOTE_SERVER);
            expect(service.serverIdentity).toBe(REMOTE_SERVER);
        });
    });

    // ─── parseTmuxData (via getTmuxTree) ─────────────────────────────────

    describe('getTmuxTree', () => {
        it('returns parsed tmux tree from exec output', async () => {
            // First call: checkTmuxInstallation (tmux -V)
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            // Second call batch: list-sessions, list-windows, list-panes
            mockExec.mockResolvedValueOnce({ stdout: 'dev:1:1700000000:1700000100\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:main:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:0:bash:/home/user:1:12345\n', stderr: '' });

            const service = new TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();

            expect(tree).toHaveLength(1);
            expect(tree[0].name).toBe('dev');
            expect(tree[0].isAttached).toBe(true);
            expect(tree[0].windows).toHaveLength(1);
            expect(tree[0].windows[0].name).toBe('main');
            expect(tree[0].windows[0].panes).toHaveLength(1);
            expect(tree[0].windows[0].panes[0].command).toBe('bash');
        });

        it('returns empty array when tmux is not installed', async () => {
            mockExec.mockRejectedValueOnce(new Error('command not found: tmux'));
            const service = new TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            expect(tree).toEqual([]);
        });

        it('returns empty array when no tmux server is running', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockRejectedValueOnce(new Error('no server running'));

            const service = new TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            expect(tree).toEqual([]);
        });

        it('caches results within cache duration', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:win:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:0:bash:/tmp:1:999\n', stderr: '' });

            const service = new TmuxService(LOCAL_SERVER);
            const first = await service.getTmuxTree();
            const second = await service.getTmuxTree();

            expect(first).toBe(second);
            // tmux -V + 3 list commands = 4 calls total (not 7)
            expect(mockExec).toHaveBeenCalledTimes(4);
        });

        it('clearCache forces fresh data on next call', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:win:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:0:bash:/tmp:1:999\n', stderr: '' });

            const service = new TmuxService(LOCAL_SERVER);
            await service.getTmuxTree();
            service.clearCache();

            mockExec.mockResolvedValueOnce({ stdout: 'b:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'b:0:win2:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'b:0:0:zsh:/home:1:111\n', stderr: '' });

            const fresh = await service.getTmuxTree();
            expect(fresh[0].name).toBe('b');
        });
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tmuxService_1 = require("../core/tmuxService");
const { mockExec } = vitest_1.vi.hoisted(() => {
    const mockExec = vitest_1.vi.fn();
    return { mockExec };
});
vitest_1.vi.mock('child_process', () => ({
    exec: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('util', () => ({
    promisify: () => mockExec,
}));
const LOCAL_SERVER = {
    id: 'local',
    label: 'Local',
    isLocal: true,
};
const REMOTE_SERVER = {
    id: 'remote:mybox',
    label: 'My Box',
    isLocal: false,
    sshConfig: {
        label: 'My Box',
        host: 'mybox.example.com',
        port: 2222,
        user: 'deploy',
        configFile: '/home/user/.ssh/config_custom',
    },
};
const REMOTE_SERVER_MINIMAL = {
    id: 'remote:simple',
    label: 'Simple',
    isLocal: false,
    sshConfig: {
        label: 'Simple',
        host: 'simple.example.com',
    },
};
(0, vitest_1.describe)('TmuxService', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    // ─── buildSshCommand ─────────────────────────────────────────────────
    (0, vitest_1.describe)('buildSshCommand', () => {
        (0, vitest_1.it)('returns null for local server', () => {
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            (0, vitest_1.expect)(service.buildSshCommand()).toBeNull();
        });
        (0, vitest_1.it)('builds SSH command with all options for remote server', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            const result = service.buildSshCommand();
            (0, vitest_1.expect)(result).toContain('ssh -t');
            (0, vitest_1.expect)(result).toContain('-F');
            (0, vitest_1.expect)(result).toContain('-p 2222');
            (0, vitest_1.expect)(result).toContain('deploy@mybox.example.com');
        });
        (0, vitest_1.it)('builds SSH command with minimal options', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER_MINIMAL);
            const result = service.buildSshCommand();
            (0, vitest_1.expect)(result).toBe('ssh -t simple.example.com');
        });
        (0, vitest_1.it)('omits port when port is 22', () => {
            const server = {
                id: 'remote:p22',
                label: 'P22',
                isLocal: false,
                sshConfig: { label: 'P22', host: 'host.com', port: 22 },
            };
            const service = new tmuxService_1.TmuxService(server);
            const result = service.buildSshCommand();
            (0, vitest_1.expect)(result).not.toContain('-p');
        });
    });
    // ─── buildTerminalCommand ────────────────────────────────────────────
    (0, vitest_1.describe)('buildTerminalCommand', () => {
        (0, vitest_1.it)('returns raw tmux command for local server', () => {
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            (0, vitest_1.expect)(service.buildTerminalCommand('tmux attach -t foo')).toBe('tmux attach -t foo');
        });
        (0, vitest_1.it)('wraps command in SSH for remote server', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            const result = service.buildTerminalCommand('tmux attach -t foo');
            (0, vitest_1.expect)(result).toContain('ssh -t');
            (0, vitest_1.expect)(result).toContain('deploy@mybox.example.com');
            (0, vitest_1.expect)(result).toContain('bash -lc');
            (0, vitest_1.expect)(result).toContain('tmux attach -t foo');
        });
        (0, vitest_1.it)('includes SSH args in terminal command', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            const result = service.buildTerminalCommand('tmux ls');
            (0, vitest_1.expect)(result).toContain('-F');
            (0, vitest_1.expect)(result).toContain('-p 2222');
        });
    });
    // ─── getTerminalName ─────────────────────────────────────────────────
    (0, vitest_1.describe)('getTerminalName', () => {
        (0, vitest_1.it)('returns session name for local server', () => {
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            (0, vitest_1.expect)(service.getTerminalName('my-session')).toBe('my-session');
        });
        (0, vitest_1.it)('prefixes with server label for remote server', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            (0, vitest_1.expect)(service.getTerminalName('my-session')).toBe('My Box: my-session');
        });
    });
    // ─── Server identity getters ─────────────────────────────────────────
    (0, vitest_1.describe)('server identity', () => {
        (0, vitest_1.it)('returns correct serverId', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            (0, vitest_1.expect)(service.serverId).toBe('remote:mybox');
        });
        (0, vitest_1.it)('returns correct serverLabel', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            (0, vitest_1.expect)(service.serverLabel).toBe('My Box');
        });
        (0, vitest_1.it)('returns correct serverIdentity', () => {
            const service = new tmuxService_1.TmuxService(REMOTE_SERVER);
            (0, vitest_1.expect)(service.serverIdentity).toBe(REMOTE_SERVER);
        });
    });
    // ─── parseTmuxData (via getTmuxTree) ─────────────────────────────────
    (0, vitest_1.describe)('getTmuxTree', () => {
        (0, vitest_1.it)('returns parsed tmux tree from exec output', async () => {
            // First call: checkTmuxInstallation (tmux -V)
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            // Second call batch: list-sessions, list-windows, list-panes
            mockExec.mockResolvedValueOnce({ stdout: 'dev:1:1700000000:1700000100\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:main:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:0:bash:/home/user:1:12345:%0\n', stderr: '' });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            (0, vitest_1.expect)(tree).toHaveLength(1);
            (0, vitest_1.expect)(tree[0].name).toBe('dev');
            (0, vitest_1.expect)(tree[0].isAttached).toBe(true);
            (0, vitest_1.expect)(tree[0].windows).toHaveLength(1);
            (0, vitest_1.expect)(tree[0].windows[0].name).toBe('main');
            (0, vitest_1.expect)(tree[0].windows[0].panes).toHaveLength(1);
            (0, vitest_1.expect)(tree[0].windows[0].panes[0].command).toBe('bash');
        });
        (0, vitest_1.it)('parses paneId from 8th field in pane format', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:1:1700000000:1700000100\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:main:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:0:claude:/home/user:1:12345:%5\n', stderr: '' });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            (0, vitest_1.expect)(tree[0].windows[0].panes[0].paneId).toBe('%5');
        });
        (0, vitest_1.it)('handles missing paneId in legacy 7-field format', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:1:1700000000:1700000100\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:main:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'dev:0:0:bash:/tmp:1:999\n', stderr: '' });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            (0, vitest_1.expect)(tree[0].windows[0].panes[0].paneId).toBeUndefined();
        });
        (0, vitest_1.it)('returns empty array when tmux is not installed', async () => {
            mockExec.mockRejectedValueOnce(new Error('command not found: tmux'));
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            (0, vitest_1.expect)(tree).toEqual([]);
        });
        (0, vitest_1.it)('returns empty array when no tmux server is running', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockRejectedValueOnce(new Error('no server running'));
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const tree = await service.getTmuxTree();
            (0, vitest_1.expect)(tree).toEqual([]);
        });
        (0, vitest_1.it)('caches results within cache duration', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:win:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'sess:0:0:bash:/tmp:1:999\n', stderr: '' });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const first = await service.getTmuxTree();
            const second = await service.getTmuxTree();
            (0, vitest_1.expect)(first).toBe(second);
            // tmux -V + 3 list commands = 4 calls total (not 7)
            (0, vitest_1.expect)(mockExec).toHaveBeenCalledTimes(4);
        });
        (0, vitest_1.it)('clearCache forces fresh data on next call', async () => {
            mockExec.mockResolvedValueOnce({ stdout: 'tmux 3.4', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:win:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'a:0:0:bash:/tmp:1:999\n', stderr: '' });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            await service.getTmuxTree();
            service.clearCache();
            mockExec.mockResolvedValueOnce({ stdout: 'b:0:100:200\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'b:0:win2:1\n', stderr: '' });
            mockExec.mockResolvedValueOnce({ stdout: 'b:0:0:zsh:/home:1:111\n', stderr: '' });
            const fresh = await service.getTmuxTree();
            (0, vitest_1.expect)(fresh[0].name).toBe('b');
        });
    });
    // ─── getPaneOptions ──────────────────────────────────────────────────
    (0, vitest_1.describe)('getPaneOptions', () => {
        (0, vitest_1.it)('parses @cc_* options from tmux output', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: '@cc_state busy\n@cc_model opus\n@cc_cost 0.1234\nsome_other_option value\n',
                stderr: '',
            });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const opts = await service.getPaneOptions('%5');
            (0, vitest_1.expect)(opts).toEqual({
                cc_state: 'busy',
                cc_model: 'opus',
                cc_cost: '0.1234',
            });
        });
        (0, vitest_1.it)('returns empty map when no @cc_* options exist', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: 'remain-on-exit off\nwindow-active-style default\n',
                stderr: '',
            });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const opts = await service.getPaneOptions('%0');
            (0, vitest_1.expect)(opts).toEqual({});
        });
        (0, vitest_1.it)('returns empty map on error', async () => {
            mockExec.mockRejectedValueOnce(new Error('pane not found'));
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const opts = await service.getPaneOptions('%99');
            (0, vitest_1.expect)(opts).toEqual({});
        });
        (0, vitest_1.it)('filters out non-cc options', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: '@cc_state idle\n@other_option value\nplain-option value\n',
                stderr: '',
            });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const opts = await service.getPaneOptions('%0');
            (0, vitest_1.expect)(opts).toEqual({ cc_state: 'idle' });
            (0, vitest_1.expect)(opts).not.toHaveProperty('other_option');
        });
    });
    // ─── getMultiplePaneOptions ──────────────────────────────────────────
    (0, vitest_1.describe)('getMultiplePaneOptions', () => {
        (0, vitest_1.it)('batches multiple pane reads into single command', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: [
                    '---%0---',
                    '@cc_state busy',
                    '@cc_model opus',
                    '---%3---',
                    '@cc_state idle',
                    '@cc_cost 0.5',
                ].join('\n'),
                stderr: '',
            });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const result = await service.getMultiplePaneOptions(['%0', '%3']);
            (0, vitest_1.expect)(result.size).toBe(2);
            (0, vitest_1.expect)(result.get('%0')).toEqual({ cc_state: 'busy', cc_model: 'opus' });
            (0, vitest_1.expect)(result.get('%3')).toEqual({ cc_state: 'idle', cc_cost: '0.5' });
        });
        (0, vitest_1.it)('returns empty map for empty paneIds array', async () => {
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const result = await service.getMultiplePaneOptions([]);
            (0, vitest_1.expect)(result.size).toBe(0);
            (0, vitest_1.expect)(mockExec).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('handles error gracefully', async () => {
            mockExec.mockRejectedValueOnce(new Error('connection failed'));
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const result = await service.getMultiplePaneOptions(['%0']);
            (0, vitest_1.expect)(result.size).toBe(0);
        });
        (0, vitest_1.it)('handles pane with no cc options', async () => {
            mockExec.mockResolvedValueOnce({
                stdout: '---%0---\n@cc_state busy\n---%1---\nremain-on-exit off\n',
                stderr: '',
            });
            const service = new tmuxService_1.TmuxService(LOCAL_SERVER);
            const result = await service.getMultiplePaneOptions(['%0', '%1']);
            (0, vitest_1.expect)(result.get('%0')).toEqual({ cc_state: 'busy' });
            (0, vitest_1.expect)(result.get('%1')).toEqual({});
        });
    });
});
//# sourceMappingURL=tmuxService.test.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const hotkeyManager_1 = require("../hotkeyManager");
function makePane(sessionName, windowIndex, index) {
    return {
        serverId: 'local', sessionName, windowIndex, index,
        command: 'bash', currentPath: '/tmp', isActive: true, pid: 1,
    };
}
function makeWindow(sessionName, index, panes) {
    return {
        serverId: 'local', sessionName, index, name: `win-${index}`,
        isActive: index === '0', panes,
    };
}
function makeSession(name, windows) {
    return {
        serverId: 'local', name, isAttached: false,
        created: '100', lastActivity: '200', windows,
    };
}
(0, vitest_1.describe)('HotkeyManager', () => {
    const manager = new hotkeyManager_1.HotkeyManager();
    const sessions = [
        makeSession('beta', [
            makeWindow('beta', '0', [makePane('beta', '0', '0')]),
        ]),
        makeSession('alpha', [
            makeWindow('alpha', '0', [
                makePane('alpha', '0', '0'),
                makePane('alpha', '0', '1'),
            ]),
        ]),
    ];
    (0, vitest_1.describe)('assignHotkeys', () => {
        (0, vitest_1.it)('assigns sequential hotkeys starting from "a"', () => {
            const result = manager.assignHotkeys(sessions);
            // Sessions sorted alphabetically: alpha first, then beta
            (0, vitest_1.expect)(result[0].name).toBe('alpha');
            (0, vitest_1.expect)(result[0].hotkey).toBe('a');
        });
        (0, vitest_1.it)('assigns hotkeys to windows and panes', () => {
            const result = manager.assignHotkeys(sessions);
            // alpha session='a', alpha:0 window='b', alpha:0.0 pane='c', alpha:0.1 pane='d'
            // beta session='e', beta:0 window='f', beta:0.0 pane='g'
            (0, vitest_1.expect)(result[0].windows[0].hotkey).toBe('b');
            (0, vitest_1.expect)(result[0].windows[0].panes[0].hotkey).toBe('c');
            (0, vitest_1.expect)(result[0].windows[0].panes[1].hotkey).toBe('d');
            (0, vitest_1.expect)(result[1].hotkey).toBe('e');
        });
        (0, vitest_1.it)('does not mutate original sessions', () => {
            const original = JSON.parse(JSON.stringify(sessions));
            manager.assignHotkeys(sessions);
            (0, vitest_1.expect)(sessions[0].hotkey).toBeUndefined();
            (0, vitest_1.expect)(JSON.stringify(sessions)).toBe(JSON.stringify(original));
        });
    });
    (0, vitest_1.describe)('getSessionByHotkey', () => {
        (0, vitest_1.it)('finds session by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getSessionByHotkey(assigned, 'a');
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found.name).toBe('alpha');
        });
        (0, vitest_1.it)('returns undefined for unknown hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            (0, vitest_1.expect)(manager.getSessionByHotkey(assigned, 'z')).toBeUndefined();
        });
    });
    (0, vitest_1.describe)('getWindowByHotkey', () => {
        (0, vitest_1.it)('finds window by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getWindowByHotkey(assigned, 'b');
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found.window.name).toBe('win-0');
            (0, vitest_1.expect)(found.session.name).toBe('alpha');
        });
    });
    (0, vitest_1.describe)('getPaneByHotkey', () => {
        (0, vitest_1.it)('finds pane by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getPaneByHotkey(assigned, 'c');
            (0, vitest_1.expect)(found).toBeDefined();
            (0, vitest_1.expect)(found.pane.index).toBe('0');
            (0, vitest_1.expect)(found.session.name).toBe('alpha');
        });
    });
    (0, vitest_1.describe)('getAllAssignments', () => {
        (0, vitest_1.it)('returns all hotkey assignments', () => {
            const assigned = manager.assignHotkeys(sessions);
            const all = manager.getAllAssignments(assigned);
            // 2 sessions + 2 windows + 3 panes = 7
            (0, vitest_1.expect)(all).toHaveLength(7);
            (0, vitest_1.expect)(all.filter(a => a.type === 'session')).toHaveLength(2);
            (0, vitest_1.expect)(all.filter(a => a.type === 'window')).toHaveLength(2);
            (0, vitest_1.expect)(all.filter(a => a.type === 'pane')).toHaveLength(3);
        });
    });
});
//# sourceMappingURL=hotkeyManager.test.js.map
import { describe, it, expect } from 'vitest';
import { HotkeyManager } from '../hotkeyManager';
import { TmuxSession, TmuxWindow, TmuxPane } from '../core/types';

function makePane(sessionName: string, windowIndex: string, index: string): TmuxPane {
    return {
        serverId: 'local', sessionName, windowIndex, index,
        command: 'bash', currentPath: '/tmp', isActive: true, pid: 1,
    };
}

function makeWindow(sessionName: string, index: string, panes: TmuxPane[]): TmuxWindow {
    return {
        serverId: 'local', sessionName, index, name: `win-${index}`,
        isActive: index === '0', panes,
    };
}

function makeSession(name: string, windows: TmuxWindow[]): TmuxSession {
    return {
        serverId: 'local', name, isAttached: false,
        created: '100', lastActivity: '200', windows,
    };
}

describe('HotkeyManager', () => {
    const manager = new HotkeyManager();

    const sessions: TmuxSession[] = [
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

    describe('assignHotkeys', () => {
        it('assigns sequential hotkeys starting from "a"', () => {
            const result = manager.assignHotkeys(sessions);
            // Sessions sorted alphabetically: alpha first, then beta
            expect(result[0].name).toBe('alpha');
            expect(result[0].hotkey).toBe('a');
        });

        it('assigns hotkeys to windows and panes', () => {
            const result = manager.assignHotkeys(sessions);
            // alpha session='a', alpha:0 window='b', alpha:0.0 pane='c', alpha:0.1 pane='d'
            // beta session='e', beta:0 window='f', beta:0.0 pane='g'
            expect(result[0].windows[0].hotkey).toBe('b');
            expect(result[0].windows[0].panes[0].hotkey).toBe('c');
            expect(result[0].windows[0].panes[1].hotkey).toBe('d');
            expect(result[1].hotkey).toBe('e');
        });

        it('does not mutate original sessions', () => {
            const original = JSON.parse(JSON.stringify(sessions));
            manager.assignHotkeys(sessions);
            expect(sessions[0].hotkey).toBeUndefined();
            expect(JSON.stringify(sessions)).toBe(JSON.stringify(original));
        });
    });

    describe('getSessionByHotkey', () => {
        it('finds session by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getSessionByHotkey(assigned, 'a');
            expect(found).toBeDefined();
            expect(found!.name).toBe('alpha');
        });

        it('returns undefined for unknown hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            expect(manager.getSessionByHotkey(assigned, 'z')).toBeUndefined();
        });
    });

    describe('getWindowByHotkey', () => {
        it('finds window by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getWindowByHotkey(assigned, 'b');
            expect(found).toBeDefined();
            expect(found!.window.name).toBe('win-0');
            expect(found!.session.name).toBe('alpha');
        });
    });

    describe('getPaneByHotkey', () => {
        it('finds pane by its assigned hotkey', () => {
            const assigned = manager.assignHotkeys(sessions);
            const found = manager.getPaneByHotkey(assigned, 'c');
            expect(found).toBeDefined();
            expect(found!.pane.index).toBe('0');
            expect(found!.session.name).toBe('alpha');
        });
    });

    describe('getAllAssignments', () => {
        it('returns all hotkey assignments', () => {
            const assigned = manager.assignHotkeys(sessions);
            const all = manager.getAllAssignments(assigned);
            // 2 sessions + 2 windows + 3 panes = 7
            expect(all).toHaveLength(7);
            expect(all.filter(a => a.type === 'session')).toHaveLength(2);
            expect(all.filter(a => a.type === 'window')).toHaveLength(2);
            expect(all.filter(a => a.type === 'pane')).toHaveLength(3);
        });
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotkeyManager = void 0;
class HotkeyManager {
    generateKey(index) {
        const letter = String.fromCharCode(97 + (index % 26));
        const cycle = Math.floor(index / 26);
        return cycle === 0 ? letter : `${letter}${cycle}`;
    }
    assignHotkeys(sessions) {
        const result = JSON.parse(JSON.stringify(sessions));
        result.sort((a, b) => a.name.localeCompare(b.name));
        let globalIndex = 0;
        for (const session of result) {
            session.hotkey = this.generateKey(globalIndex++);
            const windows = session.windows.slice().sort((a, b) => parseInt(a.index, 10) - parseInt(b.index, 10));
            session.windows = windows;
            for (const win of windows) {
                win.hotkey = this.generateKey(globalIndex++);
                for (let pi = 0; pi < win.panes.length; pi++) {
                    win.panes[pi].hotkey = this.generateKey(globalIndex++);
                }
            }
        }
        return result;
    }
    getSessionByHotkey(sessions, hotkey) {
        return sessions.find(s => s.hotkey === hotkey);
    }
    getWindowByHotkey(sessions, hotkey) {
        for (const session of sessions) {
            for (const win of session.windows) {
                if (win.hotkey === hotkey) {
                    return { session, window: win };
                }
            }
        }
        return undefined;
    }
    getPaneByHotkey(sessions, hotkey) {
        for (const session of sessions) {
            for (const win of session.windows) {
                for (const pane of win.panes) {
                    if (pane.hotkey === hotkey) {
                        return { session, window: win, pane };
                    }
                }
            }
        }
        return undefined;
    }
    getAllAssignments(sessions) {
        const assignments = [];
        for (const session of sessions) {
            if (session.hotkey) {
                assignments.push({
                    key: session.hotkey,
                    type: 'session',
                    serverId: session.serverId,
                    sessionName: session.name,
                });
            }
            for (const win of session.windows) {
                if (win.hotkey) {
                    assignments.push({
                        key: win.hotkey,
                        type: 'window',
                        serverId: win.serverId,
                        sessionName: win.sessionName,
                        windowIndex: win.index,
                    });
                }
                for (const pane of win.panes) {
                    if (pane.hotkey) {
                        assignments.push({
                            key: pane.hotkey,
                            type: 'pane',
                            serverId: pane.serverId,
                            sessionName: pane.sessionName,
                            windowIndex: pane.windowIndex,
                            paneIndex: pane.index,
                        });
                    }
                }
            }
        }
        return assignments;
    }
}
exports.HotkeyManager = HotkeyManager;
//# sourceMappingURL=hotkeyManager.js.map
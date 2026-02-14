import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
// ─── Status Bar Component ───────────────────────────────────────────────────
import { Box, Text } from 'ink';
/**
 * Bottom status bar showing agent counts and keyboard hints
 */
export function StatusBar({ agents, currentTab }) {
    // Count agents by status
    const idleCount = agents.filter((a) => a.status === 'idle').length;
    const busyCount = agents.filter((a) => a.status === 'busy').length;
    const buildingCount = agents.filter((a) => a.status === 'building').length;
    const errorCount = agents.filter((a) => a.status === 'error').length;
    // Tab indicators
    const tabIndicator = (tab, label, key) => {
        const active = currentTab === tab;
        return (_jsxs(Text, { color: active ? 'cyan' : 'gray', bold: active, children: [key, " ", label, ' │ '] }, tab));
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", paddingX: 1, children: [_jsxs(Box, { children: [_jsx(Text, { dimColor: true, children: "Agents: " }), _jsxs(Text, { color: "green", children: [idleCount, " idle"] }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsxs(Text, { color: "yellow", children: [busyCount, " busy"] }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsxs(Text, { color: "blue", children: [buildingCount, " building"] }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsxs(Text, { color: "red", children: [errorCount, " error"] })] }), _jsxs(Box, { marginTop: 1, children: [tabIndicator('agents', 'Agents', 'F1'), tabIndicator('tasks', 'Tasks', 'F2'), tabIndicator('pipelines', 'Pipelines', 'F3'), _jsx(Text, { dimColor: true, children: "Enter: Preview \u2502 a: Attach \u2502 s: Send \u2502 n: New Agent \u2502 t: New Task \u2502 r: Refresh \u2502 q: Quit" })] })] }));
}
//# sourceMappingURL=StatusBar.js.map
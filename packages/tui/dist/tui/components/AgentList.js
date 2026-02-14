import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ─── Agent List Component ───────────────────────────────────────────────────
import { Box, Text } from 'ink';
/**
 * Displays a list of agents with status indicators
 */
export function AgentList({ agents, selectedIndex, loading = false }) {
    const getStatusIcon = (status) => {
        switch (status) {
            case 'idle':
                return '●';
            case 'busy':
                return '◉';
            case 'building':
                return '⚙';
            case 'testing':
                return '✓';
            case 'error':
                return '✗';
            case 'stopped':
                return '○';
            default:
                return '?';
        }
    };
    const getStatusColor = (status) => {
        switch (status) {
            case 'idle':
                return 'green';
            case 'busy':
                return 'yellow';
            case 'building':
                return 'blue';
            case 'testing':
                return 'cyan';
            case 'error':
                return 'red';
            case 'stopped':
                return 'gray';
            default:
                return 'white';
        }
    };
    const getRuntimeBadge = (runtime) => {
        switch (runtime) {
            case 'tmux':
                return '[T]';
            case 'docker':
                return '[D]';
            case 'k8s':
                return '[K]';
            default:
                return '[?]';
        }
    };
    if (loading) {
        return (_jsx(Box, { flexDirection: "column", padding: 1, children: _jsx(Text, { dimColor: true, children: "Loading agents..." }) }));
    }
    if (agents.length === 0) {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Text, { dimColor: true, children: "No agents running" }), _jsx(Text, { dimColor: true, children: "Press 'n' to spawn a new agent" })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { paddingX: 1, borderStyle: "single", borderColor: "gray", children: _jsxs(Text, { bold: true, children: ["Agents (", agents.length, ")"] }) }), _jsx(Box, { flexDirection: "column", paddingX: 1, paddingY: 1, children: agents.map((agent, index) => {
                    const isSelected = index === selectedIndex;
                    const statusColor = getStatusColor(agent.status);
                    return (_jsxs(Box, { marginBottom: index < agents.length - 1 ? 1 : 0, children: [_jsx(Text, { color: isSelected ? 'cyan' : 'gray', children: isSelected ? '▶ ' : '  ' }), _jsxs(Text, { color: statusColor, children: [getStatusIcon(agent.status), " "] }), _jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? 'cyan' : 'white', bold: isSelected, children: agent.role }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { color: "gray", children: getRuntimeBadge(agent.runtime) }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { color: "gray", dimColor: true, children: agent.id.slice(0, 8) })] }), agent.task && (_jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { dimColor: true, children: "Task: " }), _jsx(Text, { color: "yellow", children: agent.task })] })), agent.lastActivity && (_jsx(Box, { marginLeft: 2, children: _jsxs(Text, { dimColor: true, children: ["Last activity: ", formatTimestamp(agent.lastActivity)] }) }))] })] }, agent.id));
                }) })] }));
}
function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    else if (minutes < 60) {
        return `${minutes}m ago`;
    }
    else {
        return `${hours}h ago`;
    }
}
//# sourceMappingURL=AgentList.js.map
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// ─── Pipeline View Component ────────────────────────────────────────────────
import { Box, Text } from 'ink';
/**
 * Displays active pipelines with stage progress
 */
export function PipelineView({ pipelines, selectedIndex, loading = false }) {
    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending':
                return '○';
            case 'running':
                return '◉';
            case 'completed':
                return '✓';
            case 'failed':
                return '✗';
            case 'skipped':
                return '⊘';
            default:
                return '?';
        }
    };
    const getStatusColor = (status) => {
        switch (status) {
            case 'pending':
                return 'gray';
            case 'running':
                return 'yellow';
            case 'completed':
                return 'green';
            case 'failed':
                return 'red';
            case 'skipped':
                return 'gray';
            default:
                return 'white';
        }
    };
    const getPipelineStatusColor = (status) => {
        switch (status) {
            case 'pending':
                return 'gray';
            case 'running':
                return 'yellow';
            case 'completed':
                return 'green';
            case 'failed':
                return 'red';
            default:
                return 'white';
        }
    };
    const renderProgressBar = (progress, width = 20) => {
        const filled = Math.round((progress / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    };
    if (loading) {
        return (_jsx(Box, { flexDirection: "column", padding: 1, children: _jsx(Text, { dimColor: true, children: "Loading pipelines..." }) }));
    }
    if (pipelines.length === 0) {
        return (_jsx(Box, { flexDirection: "column", padding: 1, children: _jsx(Text, { dimColor: true, children: "No pipelines running" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { paddingX: 1, borderStyle: "single", borderColor: "gray", children: _jsxs(Text, { bold: true, children: ["Pipelines (", pipelines.length, ")"] }) }), _jsx(Box, { flexDirection: "column", paddingX: 1, paddingY: 1, children: pipelines.map((pipeline, index) => {
                    const isSelected = index === selectedIndex;
                    const statusColor = getPipelineStatusColor(pipeline.status);
                    return (_jsxs(Box, { flexDirection: "column", marginBottom: index < pipelines.length - 1 ? 2 : 0, borderStyle: isSelected ? 'bold' : 'round', borderColor: isSelected ? 'cyan' : 'gray', paddingX: 1, paddingY: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? 'cyan' : 'white', bold: true, children: pipeline.name }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsx(Text, { color: statusColor, children: pipeline.status }), _jsx(Text, { dimColor: true, children: " \u2502 " }), _jsxs(Text, { children: [Math.round(pipeline.progress), "%"] })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "cyan", children: renderProgressBar(pipeline.progress) }) }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: pipeline.stages.map((stage, stageIndex) => {
                                    const stageColor = getStatusColor(stage.status);
                                    return (_jsxs(Box, { marginTop: stageIndex > 0 ? 1 : 0, children: [stageIndex > 0 && (_jsx(Box, { marginLeft: 2, children: _jsx(Text, { dimColor: true, children: "\u2502" }) })), _jsxs(Box, { marginLeft: 2, children: [_jsxs(Text, { color: stageColor, children: [getStatusIcon(stage.status), " "] }), _jsx(Text, { color: stageColor, children: stage.name }), _jsxs(Text, { dimColor: true, children: [" (", stage.tasks.length, " tasks)"] }), stage.status === 'running' && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: " \u2502 " }), _jsxs(Text, { children: [Math.round(stage.progress), "%"] })] }))] }), stage.status === 'running' && (_jsx(Box, { marginLeft: 4, marginTop: 0, children: _jsx(Text, { color: "yellow", children: renderProgressBar(stage.progress, 15) }) })), isSelected && stage.tasks.length > 0 && (_jsxs(Box, { flexDirection: "column", marginLeft: 4, marginTop: 1, children: [stage.tasks.slice(0, 3).map((taskId, taskIndex) => (_jsxs(Text, { dimColor: true, children: ["\u2022 ", taskId.slice(0, 12), "..."] }, taskIndex))), stage.tasks.length > 3 && (_jsxs(Text, { dimColor: true, children: ["...and ", stage.tasks.length - 3, " more"] }))] }))] }, stageIndex));
                                }) })] }, pipeline.id));
                }) })] }));
}
//# sourceMappingURL=PipelineView.js.map
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ─── Task Board Component ───────────────────────────────────────────────────
import { Box, Text } from 'ink';
const COLUMNS = [
    { status: 'backlog', label: 'Backlog', color: 'gray' },
    { status: 'todo', label: 'To Do', color: 'white' },
    { status: 'in_progress', label: 'In Progress', color: 'yellow' },
    { status: 'blocked', label: 'Blocked', color: 'red' },
    { status: 'review', label: 'Review', color: 'cyan' },
    { status: 'done', label: 'Done', color: 'green' },
    { status: 'failed', label: 'Failed', color: 'red' },
];
/**
 * Kanban board view of tasks
 */
export function TaskBoard({ tasks, selectedIndex, loading = false }) {
    const getTasksByStatus = (status) => {
        return tasks.filter((t) => t.status === status);
    };
    const getPriorityIcon = (priority) => {
        switch (priority) {
            case 'urgent':
                return '🔴';
            case 'high':
                return '🟠';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            default:
                return '⚪';
        }
    };
    if (loading) {
        return (_jsx(Box, { flexDirection: "column", padding: 1, children: _jsx(Text, { dimColor: true, children: "Loading tasks..." }) }));
    }
    if (tasks.length === 0) {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Text, { dimColor: true, children: "No tasks found" }), _jsx(Text, { dimColor: true, children: "Press 't' to create a new task" })] }));
    }
    // Get all tasks as a flat list for selection
    const flatTasks = [];
    COLUMNS.forEach((column, columnIndex) => {
        const columnTasks = getTasksByStatus(column.status);
        columnTasks.forEach((task) => {
            flatTasks.push({ task, columnIndex });
        });
    });
    const selectedTask = flatTasks[selectedIndex]?.task;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { paddingX: 1, borderStyle: "single", borderColor: "gray", children: _jsxs(Text, { bold: true, children: ["Task Board (", tasks.length, " tasks)"] }) }), _jsx(Box, { flexDirection: "row", paddingX: 1, paddingY: 1, children: COLUMNS.map((column, columnIndex) => {
                    const columnTasks = getTasksByStatus(column.status);
                    return (_jsxs(Box, { flexDirection: "column", width: "14%", marginRight: columnIndex < COLUMNS.length - 1 ? 1 : 0, borderStyle: "round", borderColor: column.color, children: [_jsxs(Box, { paddingX: 1, paddingBottom: 1, children: [_jsx(Text, { bold: true, color: column.color, children: column.label }), _jsxs(Text, { dimColor: true, children: [" (", columnTasks.length, ")"] })] }), _jsx(Box, { flexDirection: "column", paddingX: 1, children: columnTasks.length === 0 ? (_jsx(Text, { dimColor: true, children: "\u2014" })) : (columnTasks.map((task) => {
                                    const isSelected = selectedTask?.id === task.id;
                                    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, paddingX: 1, paddingY: 1, borderStyle: isSelected ? 'bold' : 'round', borderColor: isSelected ? 'cyan' : 'gray', children: [_jsxs(Box, { children: [_jsxs(Text, { children: [getPriorityIcon(task.priority), " "] }), _jsx(Text, { color: isSelected ? 'cyan' : 'white', bold: isSelected, wrap: "truncate", children: task.title.slice(0, 20) })] }), task.assignedTo && (_jsxs(Text, { dimColor: true, children: ["@", task.assignedTo] }))] }, task.id));
                                })) })] }, column.status));
                }) }), selectedTask && (_jsxs(Box, { flexDirection: "column", paddingX: 1, marginTop: 1, borderStyle: "single", borderColor: "cyan", children: [_jsx(Text, { bold: true, color: "cyan", children: "Selected Task" }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: [getPriorityIcon(selectedTask.priority), " ", selectedTask.title] }) }), selectedTask.description && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: selectedTask.description }) })), selectedTask.assignedTo && (_jsxs(Box, { marginTop: 1, children: [_jsx(Text, { dimColor: true, children: "Assigned to: " }), _jsx(Text, { children: selectedTask.assignedTo })] })), selectedTask.dependencies && selectedTask.dependencies.length > 0 && (_jsxs(Box, { marginTop: 1, children: [_jsx(Text, { dimColor: true, children: "Depends on: " }), _jsx(Text, { children: selectedTask.dependencies.join(', ') })] }))] }))] }));
}
//# sourceMappingURL=TaskBoard.js.map
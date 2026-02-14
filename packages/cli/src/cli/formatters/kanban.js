"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatKanbanBoard = formatKanbanBoard;
const icons_1 = require("./icons");
const table_1 = require("./table");
function formatKanbanBoard(board, columns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']) {
    const columnWidth = 30;
    const lines = [];
    // Header
    const header = columns.map(col => centerPad(col.replace('_', ' '), columnWidth)).join('│');
    lines.push((0, icons_1.colorize)(header, icons_1.colors.bold));
    // Separator
    const separator = columns.map(() => '─'.repeat(columnWidth)).join('┼');
    lines.push((0, icons_1.colorize)(separator, icons_1.colors.dim));
    // Group tasks by column
    const tasksByColumn = new Map();
    for (const col of columns) {
        tasksByColumn.set(col, []);
    }
    for (const task of board.tasks) {
        const col = task.column.toUpperCase();
        if (tasksByColumn.has(col)) {
            tasksByColumn.get(col).push(task);
        }
    }
    // Find max rows
    const maxRows = Math.max(...Array.from(tasksByColumn.values()).map(tasks => tasks.length), 1);
    // Build rows
    for (let i = 0; i < maxRows; i++) {
        const row = columns.map(col => {
            const tasks = tasksByColumn.get(col) || [];
            if (i < tasks.length) {
                const task = tasks[i];
                const icon = (0, icons_1.statusIcon)(col === 'DONE' ? 'completed' : col === 'IN_PROGRESS' ? 'running' : 'pending');
                const title = (0, table_1.truncate)(task.title, columnWidth - 4);
                return ` ${icon} ${title}`.padEnd(columnWidth);
            }
            else {
                return ' '.repeat(columnWidth);
            }
        }).join('│');
        lines.push(row);
    }
    return lines.join('\n');
}
function centerPad(str, width) {
    if (str.length >= width)
        return str.substring(0, width);
    const padding = width - str.length;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}
//# sourceMappingURL=kanban.js.map
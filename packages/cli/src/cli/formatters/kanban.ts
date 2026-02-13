import { colors, colorize, statusIcon } from './icons';
import { truncate } from './table';

interface Task {
    id: string;
    title: string;
    column: string;
    priority?: number;
    assignee?: string;
}

interface Board {
    lanes: Array<{ name: string }>;
    tasks: Task[];
}

export function formatKanbanBoard(board: Board, columns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']): string {
    const columnWidth = 30;
    const lines: string[] = [];

    // Header
    const header = columns.map(col =>
        centerPad(col.replace('_', ' '), columnWidth)
    ).join('│');
    lines.push(colorize(header, colors.bold));

    // Separator
    const separator = columns.map(() => '─'.repeat(columnWidth)).join('┼');
    lines.push(colorize(separator, colors.dim));

    // Group tasks by column
    const tasksByColumn = new Map<string, Task[]>();
    for (const col of columns) {
        tasksByColumn.set(col, []);
    }

    for (const task of board.tasks) {
        const col = task.column.toUpperCase();
        if (tasksByColumn.has(col)) {
            tasksByColumn.get(col)!.push(task);
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
                const icon = statusIcon(col === 'DONE' ? 'completed' : col === 'IN_PROGRESS' ? 'running' : 'pending');
                const title = truncate(task.title, columnWidth - 4);
                return ` ${icon} ${title}`.padEnd(columnWidth);
            } else {
                return ' '.repeat(columnWidth);
            }
        }).join('│');
        lines.push(row);
    }

    return lines.join('\n');
}

function centerPad(str: string, width: number): string {
    if (str.length >= width) return str.substring(0, width);
    const padding = width - str.length;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const table_1 = require("../../cli/formatters/table");
const icons_1 = require("../../cli/formatters/icons");
const kanban_1 = require("../../cli/formatters/kanban");
(0, vitest_1.describe)('Table Formatter', () => {
    (0, vitest_1.it)('should format table with data', () => {
        const data = [
            { id: 'a1', name: 'Agent 1', status: 'active' },
            { id: 'a2', name: 'Agent 2', status: 'idle' }
        ];
        const result = (0, table_1.formatTable)(data, [
            { key: 'id', title: 'ID', width: 5 },
            { key: 'name', title: 'Name', width: 10 },
            { key: 'status', title: 'Status', width: 8 }
        ]);
        (0, vitest_1.expect)(result).toContain('ID');
        (0, vitest_1.expect)(result).toContain('Name');
        (0, vitest_1.expect)(result).toContain('Status');
        (0, vitest_1.expect)(result).toContain('Agent 1');
    });
    (0, vitest_1.it)('should truncate long strings', () => {
        const result = (0, table_1.truncate)('This is a very long string that needs truncating', 20);
        (0, vitest_1.expect)(result).toHaveLength(20);
        (0, vitest_1.expect)(result).toContain('...');
    });
    (0, vitest_1.it)('should handle empty data', () => {
        const result = (0, table_1.formatTable)([], [
            { key: 'id', title: 'ID' }
        ]);
        (0, vitest_1.expect)(result).toContain('No data');
    });
});
(0, vitest_1.describe)('Icons', () => {
    (0, vitest_1.it)('should return status icons', () => {
        (0, vitest_1.expect)((0, icons_1.statusIcon)('active')).toBeTruthy();
        (0, vitest_1.expect)((0, icons_1.statusIcon)('error')).toBeTruthy();
        (0, vitest_1.expect)((0, icons_1.statusIcon)('idle')).toBeTruthy();
    });
    (0, vitest_1.it)('should return role icons', () => {
        (0, vitest_1.expect)((0, icons_1.roleIcon)('coder')).toBeTruthy();
        (0, vitest_1.expect)((0, icons_1.roleIcon)('reviewer')).toBeTruthy();
        (0, vitest_1.expect)((0, icons_1.roleIcon)('unknown')).toBeTruthy();
    });
});
(0, vitest_1.describe)('Kanban Formatter', () => {
    (0, vitest_1.it)('should format kanban board', () => {
        const board = {
            lanes: [{ name: 'default' }],
            tasks: [
                { id: 't1', title: 'Task 1', column: 'TODO' },
                { id: 't2', title: 'Task 2', column: 'IN_PROGRESS' }
            ]
        };
        const result = (0, kanban_1.formatKanbanBoard)(board);
        (0, vitest_1.expect)(result).toContain('TODO');
        (0, vitest_1.expect)(result).toContain('IN PROGRESS'); // Formatted with space
        (0, vitest_1.expect)(result).toContain('Task 1');
        (0, vitest_1.expect)(result).toContain('Task 2');
    });
});
//# sourceMappingURL=formatters.test.js.map
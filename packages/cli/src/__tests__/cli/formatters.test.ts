import { describe, it, expect } from 'vitest';
import { formatTable, truncate } from '../../cli/formatters/table';
import { statusIcon, roleIcon } from '../../cli/formatters/icons';
import { formatKanbanBoard } from '../../cli/formatters/kanban';

describe('Table Formatter', () => {
    it('should format table with data', () => {
        const data = [
            { id: 'a1', name: 'Agent 1', status: 'active' },
            { id: 'a2', name: 'Agent 2', status: 'idle' }
        ];

        const result = formatTable(data, [
            { key: 'id', title: 'ID', width: 5 },
            { key: 'name', title: 'Name', width: 10 },
            { key: 'status', title: 'Status', width: 8 }
        ]);

        expect(result).toContain('ID');
        expect(result).toContain('Name');
        expect(result).toContain('Status');
        expect(result).toContain('Agent 1');
    });

    it('should truncate long strings', () => {
        const result = truncate('This is a very long string that needs truncating', 20);
        expect(result).toHaveLength(20);
        expect(result).toContain('...');
    });

    it('should handle empty data', () => {
        const result = formatTable([], [
            { key: 'id', title: 'ID' }
        ]);

        expect(result).toContain('No data');
    });
});

describe('Icons', () => {
    it('should return status icons', () => {
        expect(statusIcon('active')).toBeTruthy();
        expect(statusIcon('error')).toBeTruthy();
        expect(statusIcon('idle')).toBeTruthy();
    });

    it('should return role icons', () => {
        expect(roleIcon('coder')).toBeTruthy();
        expect(roleIcon('reviewer')).toBeTruthy();
        expect(roleIcon('unknown')).toBeTruthy();
    });
});

describe('Kanban Formatter', () => {
    it('should format kanban board', () => {
        const board = {
            lanes: [{ name: 'default' }],
            tasks: [
                { id: 't1', title: 'Task 1', column: 'TODO' },
                { id: 't2', title: 'Task 2', column: 'IN_PROGRESS' }
            ]
        };

        const result = formatKanbanBoard(board);

        expect(result).toContain('TODO');
        expect(result).toContain('IN PROGRESS'); // Formatted with space
        expect(result).toContain('Task 1');
        expect(result).toContain('Task 2');
    });
});

import { colors, colorize } from './icons';

export interface Column {
    key: string;
    title: string;
    width?: number;
    align?: 'left' | 'right' | 'center';
    formatter?: (value: any) => string;
}

export function formatTable(data: any[], columns: Column[]): string {
    if (data.length === 0) {
        return colorize('No data', colors.dim);
    }

    // Calculate column widths
    const widths = columns.map(col => {
        const maxDataWidth = Math.max(
            ...data.map(row => {
                const value = col.formatter ? col.formatter(row[col.key]) : row[col.key];
                return stripAnsi(String(value || '')).length;
            })
        );
        return Math.max(col.width || 0, col.title.length, maxDataWidth);
    });

    // Build header
    const header = columns.map((col, i) =>
        pad(col.title, widths[i], 'left')
    ).join('  ');

    const separator = widths.map(w => '─'.repeat(w)).join('  ');

    // Build rows
    const rows = data.map(row =>
        columns.map((col, i) => {
            const value = col.formatter ? col.formatter(row[col.key]) : row[col.key];
            const str = String(value || '');
            return pad(str, widths[i], col.align || 'left');
        }).join('  ')
    );

    return [
        colorize(header, colors.bold),
        colorize(separator, colors.dim),
        ...rows
    ].join('\n');
}

function pad(str: string, width: number, align: 'left' | 'right' | 'center'): string {
    const len = stripAnsi(str).length;
    if (len >= width) return str;

    const padding = width - len;

    switch (align) {
        case 'right':
            return ' '.repeat(padding) + str;
        case 'center':
            const leftPad = Math.floor(padding / 2);
            const rightPad = padding - leftPad;
            return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
        default:
            return str + ' '.repeat(padding);
    }
}

function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

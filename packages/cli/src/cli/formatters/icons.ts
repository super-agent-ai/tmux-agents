// ANSI color codes
export const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',

    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

export function colorize(text: string, color: string): string {
    return `${color}${text}${colors.reset}`;
}

export function statusIcon(status: string): string {
    switch (status.toLowerCase()) {
        case 'active':
        case 'running':
        case 'healthy':
        case 'ok':
            return colorize('●', colors.green);
        case 'idle':
        case 'waiting':
        case 'pending':
            return colorize('◐', colors.yellow);
        case 'error':
        case 'failed':
        case 'unhealthy':
            return colorize('✗', colors.red);
        case 'completed':
        case 'done':
        case 'success':
            return colorize('✓', colors.green);
        case 'paused':
        case 'stopped':
            return colorize('■', colors.dim);
        default:
            return colorize('○', colors.dim);
    }
}

export function roleIcon(role: string): string {
    switch (role.toLowerCase()) {
        case 'coder':
        case 'developer':
            return '💻';
        case 'reviewer':
        case 'qa':
            return '🔍';
        case 'tester':
            return '🧪';
        case 'researcher':
            return '📚';
        case 'architect':
            return '🏗️';
        case 'devops':
            return '⚙️';
        default:
            return '🤖';
    }
}

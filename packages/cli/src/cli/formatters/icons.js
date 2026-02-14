"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colors = void 0;
exports.colorize = colorize;
exports.statusIcon = statusIcon;
exports.roleIcon = roleIcon;
// ANSI color codes
exports.colors = {
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
function colorize(text, color) {
    return `${color}${text}${exports.colors.reset}`;
}
function statusIcon(status) {
    switch (status.toLowerCase()) {
        case 'active':
        case 'running':
        case 'healthy':
        case 'ok':
            return colorize('●', exports.colors.green);
        case 'idle':
        case 'waiting':
        case 'pending':
            return colorize('◐', exports.colors.yellow);
        case 'error':
        case 'failed':
        case 'unhealthy':
            return colorize('✗', exports.colors.red);
        case 'completed':
        case 'done':
        case 'success':
            return colorize('✓', exports.colors.green);
        case 'paused':
        case 'stopped':
            return colorize('■', exports.colors.dim);
        default:
            return colorize('○', exports.colors.dim);
    }
}
function roleIcon(role) {
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
//# sourceMappingURL=icons.js.map
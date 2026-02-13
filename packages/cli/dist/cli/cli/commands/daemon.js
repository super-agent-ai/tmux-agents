"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDaemonCommands = registerDaemonCommands;
const output_1 = require("../util/output");
const icons_1 = require("../formatters/icons");
function registerDaemonCommands(program, client) {
    const daemon = program
        .command('daemon')
        .description('Manage tmux-agents daemon');
    daemon
        .command('start')
        .description('Start daemon (detached)')
        .action(async () => {
        try {
            // TODO: Implement daemon spawn
            (0, output_1.error)('Daemon start not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    daemon
        .command('stop')
        .description('Stop daemon gracefully')
        .action(async () => {
        try {
            await client.shutdown();
            (0, output_1.output)('Daemon stopped');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    daemon
        .command('restart')
        .description('Restart daemon')
        .action(async () => {
        try {
            await client.shutdown();
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));
            // TODO: Start daemon
            (0, output_1.output)('Daemon restarted');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    daemon
        .command('run')
        .description('Run daemon in foreground')
        .option('--debug', 'Enable debug logging')
        .action(async (options) => {
        try {
            // TODO: Implement foreground daemon
            (0, output_1.error)('Daemon run not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    daemon
        .command('status')
        .description('Show daemon status')
        .option('--json', 'Output JSON')
        .action(async (options) => {
        try {
            const health = await client.health();
            if (options.json) {
                (0, output_1.output)(health, { json: true });
            }
            else {
                const isHealthy = health.overall === 'healthy';
                const icon = isHealthy ? (0, icons_1.statusIcon)('healthy') : (0, icons_1.statusIcon)('error');
                console.log(`${icon} Daemon: ${health.overall}`);
                console.log(`Uptime: ${formatUptime(health.uptime / 1000)}`);
                if (health.components && health.components.length > 0) {
                    console.log('\nComponents:');
                    health.components.forEach((comp) => {
                        const compIcon = comp.status === 'healthy' ? (0, icons_1.statusIcon)('ok') : (0, icons_1.statusIcon)('error');
                        const latency = comp.latency !== undefined ? ` (${comp.latency}ms)` : '';
                        console.log(`  ${compIcon} ${comp.name}${latency}`);
                    });
                }
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    daemon
        .command('logs')
        .description('View daemon logs')
        .option('-f, --follow', 'Follow log output')
        .option('--since <duration>', 'Show logs since duration (e.g., "1h", "30m")')
        .action(async (options) => {
        try {
            // TODO: Implement log streaming
            (0, output_1.error)('Daemon logs not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    }
    else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    else {
        return `${minutes}m`;
    }
}
//# sourceMappingURL=daemon.js.map
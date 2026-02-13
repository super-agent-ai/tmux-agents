import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { formatTable } from '../formatters/table';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerDaemonCommands(program: Command, client: DaemonClient): void {
    const daemon = program
        .command('daemon')
        .description('Manage tmux-agents daemon');

    daemon
        .command('start')
        .description('Start daemon (detached)')
        .action(async () => {
            try {
                // TODO: Implement daemon spawn
                error('Daemon start not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });

    daemon
        .command('stop')
        .description('Stop daemon gracefully')
        .action(async () => {
            try {
                await client.shutdown();
                output('Daemon stopped');
            } catch (err: any) {
                error(err.message);
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
                output('Daemon restarted');
            } catch (err: any) {
                error(err.message);
            }
        });

    daemon
        .command('run')
        .description('Run daemon in foreground')
        .option('--debug', 'Enable debug logging')
        .action(async (options) => {
            try {
                // TODO: Implement foreground daemon
                error('Daemon run not yet implemented');
            } catch (err: any) {
                error(err.message);
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
                    output(health, { json: true });
                } else {
                    const isHealthy = health.overall === 'healthy';
                    const icon = isHealthy ? statusIcon('healthy') : statusIcon('error');
                    console.log(`${icon} Daemon: ${health.overall}`);
                    console.log(`Uptime: ${formatUptime(health.uptime / 1000)}`);

                    if (health.components && health.components.length > 0) {
                        console.log('\nComponents:');
                        health.components.forEach((comp: any) => {
                            const compIcon = comp.status === 'healthy' ? statusIcon('ok') : statusIcon('error');
                            const latency = comp.latency !== undefined ? ` (${comp.latency}ms)` : '';
                            console.log(`  ${compIcon} ${comp.name}${latency}`);
                        });
                    }
                }
            } catch (err: any) {
                error(err.message);
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
                error('Daemon logs not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

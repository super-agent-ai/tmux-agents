import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { formatTable } from '../formatters/table';
import { statusIcon, colorize, colors } from '../formatters/icons';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function registerDaemonCommands(program: Command, client: DaemonClient): void {
    const daemon = program
        .command('daemon')
        .description('Manage tmux-agents daemon');

    daemon
        .command('start')
        .description('Start daemon (detached)')
        .option('--foreground', 'Run in foreground (do not detach)')
        .action(async (options) => {
            try {
                // Check if already running
                try {
                    const health = await client.health();
                    output('Daemon is already running');
                    return;
                } catch (e) {
                    // Not running, continue with start
                }

                // Find the supervisor script
                // Try multiple possible locations
                const possiblePaths = [
                    // From installed global location
                    path.join(__dirname, '../../../out/daemon/supervisor.js'),
                    // From development location
                    path.join(__dirname, '../../../../../out/daemon/supervisor.js'),
                    // From repo root
                    path.join(process.cwd(), 'out/daemon/supervisor.js'),
                ];

                let supervisorPath: string | undefined;
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) {
                        supervisorPath = p;
                        break;
                    }
                }

                if (!supervisorPath) {
                    error('Could not find daemon supervisor. Make sure tmux-agents is built (npm run compile)');
                    return;
                }

                const args = ['start'];
                const env = {
                    ...process.env,
                    DAEMON_FOREGROUND: options.foreground ? '1' : '0'
                };

                if (options.foreground) {
                    // Run in foreground
                    const proc = cp.spawn('node', [supervisorPath, ...args], {
                        stdio: 'inherit',
                        env
                    });

                    proc.on('error', (err) => {
                        error(`Failed to start daemon: ${err.message}`);
                    });

                    // Keep process alive
                    process.on('SIGINT', () => {
                        proc.kill('SIGTERM');
                    });
                } else {
                    // Run in background (detached)
                    const proc = cp.spawn('node', [supervisorPath, ...args], {
                        detached: true,
                        stdio: 'ignore',
                        env
                    });

                    proc.unref();

                    // Wait a bit and check if it started
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    try {
                        const health = await client.health();
                        output('Daemon started successfully');
                    } catch (e) {
                        error('Daemon started but is not responding yet. Check logs for details.');
                    }
                }
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

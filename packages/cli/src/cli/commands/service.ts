import { Command } from 'commander';
import { output, error } from '../util/output';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerServiceCommands(program: Command): void {
    const service = program
        .command('service')
        .description('Manage system service (launchd/systemd)');

    service
        .command('install')
        .description('Install system service')
        .action(async () => {
            try {
                // TODO: Implement service installation
                error('Service install not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });

    service
        .command('uninstall')
        .description('Uninstall system service')
        .action(async () => {
            try {
                // TODO: Implement service uninstallation
                error('Service uninstall not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });

    service
        .command('status')
        .description('Check service status')
        .action(async () => {
            try {
                // TODO: Implement service status check
                error('Service status not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });
}

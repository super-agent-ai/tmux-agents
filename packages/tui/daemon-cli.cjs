#!/usr/bin/env node

// Standalone daemon CLI entry point
// This file can be invoked with: node daemon-cli.cjs <command>

const { Supervisor } = require('./dist/daemon/daemon/supervisor.cjs');

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined;

    const supervisor = new Supervisor(configPath);

    switch (command) {
        case 'start':
            supervisor.setupSignalHandlers();
            await supervisor.startDaemon();
            break;

        case 'run':
            supervisor.setupSignalHandlers();
            await supervisor.startForeground();
            break;

        case 'stop':
            await supervisor.stop();
            break;

        case 'status':
            await supervisor.status();
            break;

        default:
            console.error('Usage: tmux-agents daemon <start|run|stop|status> [--config <path>]');
            process.exit(1);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

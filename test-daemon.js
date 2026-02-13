#!/usr/bin/env node
// Test script to start daemon manually

const { Supervisor } = require('./out/daemon/supervisor');

const args = process.argv.slice(2);
const command = args[0] || 'start';

async function main() {
	const supervisor = new Supervisor();

	switch (command) {
		case 'start':
			console.log('Starting daemon...');
			await supervisor.start();
			break;
		case 'stop':
			console.log('Stopping daemon...');
			const pid = supervisor.getPid();
			if (pid) {
				process.kill(pid, 'SIGTERM');
				console.log('Sent SIGTERM to daemon (PID: %d)', pid);
			} else {
				console.log('Daemon not running (no PID file)');
			}
			break;
		case 'status':
			const running = supervisor.isRunning();
			const p = supervisor.getPid();
			console.log('Daemon %s', running ? 'RUNNING' : 'STOPPED');
			if (p) {
				console.log('PID: %d', p);
			}
			break;
		default:
			console.error('Unknown command: %s', command);
			console.error('Usage: node test-daemon.js [start|stop|status]');
			process.exit(1);
	}
}

main().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});

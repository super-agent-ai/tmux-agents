// ─── Worker Entry Point ──────────────────────────────────────────────────────

import { DaemonServer } from './server';

/**
 * Worker process - spawned by supervisor
 * This is the actual daemon server process
 */
async function main() {
	try {
		const server = new DaemonServer();
		await server.start();

		// Keep process alive
		process.on('SIGTERM', async () => {
			await server.stop();
			process.exit(0);
		});

		process.on('SIGINT', async () => {
			await server.stop();
			process.exit(0);
		});
	} catch (error) {
		console.error('[Worker] Failed to start:', error);
		process.exit(1);
	}
}

// Only run if this is the worker process
if (process.env.DAEMON_WORKER === '1') {
	main();
}

import { DaemonClient } from '../../client';
import { error } from './output';
import * as readline from 'readline';

export async function ensureDaemon(client: DaemonClient, autoStart: boolean = true): Promise<void> {
    const running = await client.isRunning();

    if (!running) {
        if (autoStart) {
            const answer = await prompt('Daemon not running. Start it now? (y/n): ');
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                // TODO: Implement daemon start
                error('Daemon start not yet implemented. Please run: tmux-agents daemon start', 2);
            } else {
                error('Daemon not running', 2);
            }
        } else {
            error('Daemon not running', 2);
        }
    }
}

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

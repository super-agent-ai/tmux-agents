import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── Daemon Discovery ──────────────────────────────────────────────────────

export function getDaemonDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.tmux-agents');
}

export function getSocketPath(): string {
    const daemonDir = getDaemonDir();
    return path.join(daemonDir, 'daemon.sock');
}

export function getPidFilePath(): string {
    const daemonDir = getDaemonDir();
    return path.join(daemonDir, 'daemon.pid');
}

export async function isDaemonRunning(): Promise<boolean> {
    const pidFile = getPidFilePath();

    try {
        // Check if PID file exists
        if (!fs.existsSync(pidFile)) {
            return false;
        }

        // Read PID
        const pidStr = fs.readFileSync(pidFile, 'utf-8').trim();
        const pid = parseInt(pidStr, 10);

        if (isNaN(pid)) {
            return false;
        }

        // Check if process is running
        try {
            process.kill(pid, 0); // Signal 0 checks existence without killing
            return true;
        } catch (e: any) {
            if (e.code === 'ESRCH') {
                // Process doesn't exist
                return false;
            }
            // EPERM means process exists but we don't have permission - still running
            return e.code === 'EPERM';
        }
    } catch (e) {
        return false;
    }
}

export async function waitForDaemon(timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await isDaemonRunning()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
}

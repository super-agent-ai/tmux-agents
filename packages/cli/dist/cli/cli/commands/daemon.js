"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDaemonCommands = registerDaemonCommands;
const output_1 = require("../util/output");
const icons_1 = require("../formatters/icons");
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function registerDaemonCommands(program, client) {
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
                (0, output_1.output)('Daemon is already running');
                return;
            }
            catch (e) {
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
            let supervisorPath;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    supervisorPath = p;
                    break;
                }
            }
            if (!supervisorPath) {
                (0, output_1.error)('Could not find daemon supervisor. Make sure tmux-agents is built (npm run compile)');
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
                    (0, output_1.error)(`Failed to start daemon: ${err.message}`);
                });
                // Keep process alive
                process.on('SIGINT', () => {
                    proc.kill('SIGTERM');
                });
            }
            else {
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
                    (0, output_1.output)('Daemon started successfully');
                }
                catch (e) {
                    (0, output_1.error)('Daemon started but is not responding yet. Check logs for details.');
                }
            }
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
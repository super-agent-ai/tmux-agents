#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const client_1 = require("../client");
const output_1 = require("./util/output");
const daemon_1 = require("./commands/daemon");
const agent_1 = require("./commands/agent");
const task_1 = require("./commands/task");
const team_1 = require("./commands/team");
const pipeline_1 = require("./commands/pipeline");
const runtime_1 = require("./commands/runtime");
const fanout_1 = require("./commands/fanout");
const service_1 = require("./commands/service");
const mcp_1 = require("./commands/mcp");
const bash_1 = require("./completion/bash");
const zsh_1 = require("./completion/zsh");
const fish_1 = require("./completion/fish");
const packageJson = require('../../../package.json');
const program = new commander_1.Command();
const client = new client_1.DaemonClient();
program
    .name('tmux-agents')
    .description('AI Agent orchestration platform for tmux')
    .version(packageJson.version);
// Register all commands
(0, daemon_1.registerDaemonCommands)(program, client);
(0, agent_1.registerAgentCommands)(program, client);
(0, task_1.registerTaskCommands)(program, client);
(0, team_1.registerTeamCommands)(program, client);
(0, pipeline_1.registerPipelineCommands)(program, client);
(0, runtime_1.registerRuntimeCommands)(program, client);
(0, fanout_1.registerFanoutCommand)(program, client);
(0, service_1.registerServiceCommands)(program);
(0, mcp_1.registerMcpCommand)(program);
// Health check command
program
    .command('health')
    .description('Check daemon health')
    .option('--json', 'Output JSON')
    .action(async (options) => {
    try {
        const health = await client.health();
        if (options.json) {
            (0, output_1.output)(health, { json: true });
        }
        else {
            (0, output_1.output)(health.ok ? 'Healthy' : 'Unhealthy');
        }
        process.exit(health.ok ? 0 : 1);
    }
    catch (err) {
        if (options.json) {
            (0, output_1.output)({ ok: false, error: err.message }, { json: true });
        }
        else {
            (0, output_1.error)(err.message, 1);
        }
    }
});
// TUI command
program
    .command('tui')
    .description('Launch Terminal UI dashboard')
    .option('--socket <path>', 'Daemon socket path')
    .action(async (options) => {
    try {
        const { spawn } = require('child_process');
        const path = require('path');
        // Find the TUI launcher script
        const tuiLauncher = path.join(__dirname, '../../../../tui/tui.cjs');
        const args = [];
        if (options.socket) {
            args.push('--socket', options.socket);
        }
        const child = spawn('node', [tuiLauncher, ...args], {
            stdio: 'inherit',
            env: process.env
        });
        child.on('error', (err) => {
            (0, output_1.error)(`Failed to launch TUI: ${err.message}`);
        });
        child.on('exit', (code) => {
            process.exit(code || 0);
        });
    }
    catch (err) {
        (0, output_1.error)(`Failed to launch TUI: ${err.message}`);
    }
});
// Web UI command
program
    .command('web')
    .description('Launch web UI')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--host <host>', 'Host to bind to', '0.0.0.0')
    .action(async (options) => {
    try {
        const { startWebServer } = await import('../web/server.js');
        const port = parseInt(options.port) || 3000;
        const server = startWebServer(port, options.host);
        // Handle shutdown
        process.on('SIGINT', () => {
            console.log('\n\nShutting down web server...');
            server.close(() => {
                console.log('Web server stopped');
                process.exit(0);
            });
        });
        process.on('SIGTERM', () => {
            server.close(() => {
                process.exit(0);
            });
        });
    }
    catch (err) {
        (0, output_1.error)(`Failed to start web server: ${err.message}`);
    }
});
// Completion command
program
    .command('completion')
    .description('Generate shell completion script')
    .argument('<shell>', 'Shell type (bash, zsh, fish)')
    .action((shell) => {
    switch (shell.toLowerCase()) {
        case 'bash':
            console.log((0, bash_1.generateBashCompletion)('tmux-agents'));
            break;
        case 'zsh':
            console.log((0, zsh_1.generateZshCompletion)('tmux-agents'));
            break;
        case 'fish':
            console.log((0, fish_1.generateFishCompletion)('tmux-agents'));
            break;
        default:
            (0, output_1.error)(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
    }
});
// Parse arguments
program.parse(process.argv);
// Show help if no command provided
if (process.argv.length === 2) {
    program.help();
}
//# sourceMappingURL=index.js.map
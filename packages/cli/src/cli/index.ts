#!/usr/bin/env node

import { Command } from 'commander';
import { DaemonClient } from '../client';
import { output, error } from './util/output';
import { ensureDaemon } from './util/daemon-guard';
import { registerDaemonCommands } from './commands/daemon';
import { registerAgentCommands } from './commands/agent';
import { registerTaskCommands } from './commands/task';
import { registerTeamCommands } from './commands/team';
import { registerPipelineCommands } from './commands/pipeline';
import { registerRuntimeCommands } from './commands/runtime';
import { registerFanoutCommand } from './commands/fanout';
import { registerServiceCommands } from './commands/service';
import { registerMcpCommand } from './commands/mcp';
import { generateBashCompletion } from './completion/bash';
import { generateZshCompletion } from './completion/zsh';
import { generateFishCompletion } from './completion/fish';

const packageJson = require('../../../package.json');

const program = new Command();
const client = new DaemonClient();

program
    .name('tmux-agents')
    .description('AI Agent orchestration platform for tmux')
    .version(packageJson.version);

// Register all commands
registerDaemonCommands(program, client);
registerAgentCommands(program, client);
registerTaskCommands(program, client);
registerTeamCommands(program, client);
registerPipelineCommands(program, client);
registerRuntimeCommands(program, client);
registerFanoutCommand(program, client);
registerServiceCommands(program);
registerMcpCommand(program);

// Health check command
program
    .command('health')
    .description('Check daemon health')
    .option('--json', 'Output JSON')
    .action(async (options) => {
        try {
            const health = await client.health();

            if (options.json) {
                output(health, { json: true });
            } else {
                output(health.ok ? 'Healthy' : 'Unhealthy');
            }

            process.exit(health.ok ? 0 : 1);
        } catch (err: any) {
            if (options.json) {
                output({ ok: false, error: err.message }, { json: true });
            } else {
                error(err.message, 1);
            }
        }
    });

// TUI command
program
    .command('tui')
    .description('Launch Terminal UI dashboard')
    .action(async () => {
        try {
            // TODO: Launch TUI
            error('TUI not yet implemented');
        } catch (err: any) {
            error(err.message);
        }
    });

// Web UI command
program
    .command('web')
    .description('Launch web UI')
    .option('-p, --port <port>', 'Port number', parseInt, 3000)
    .action(async (options) => {
        try {
            // TODO: Launch web UI
            error('Web UI not yet implemented');
        } catch (err: any) {
            error(err.message);
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
                console.log(generateBashCompletion('tmux-agents'));
                break;
            case 'zsh':
                console.log(generateZshCompletion('tmux-agents'));
                break;
            case 'fish':
                console.log(generateFishCompletion('tmux-agents'));
                break;
            default:
                error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
        }
    });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
    program.help();
}

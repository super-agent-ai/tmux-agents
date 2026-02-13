import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { resolveAgentId } from '../util/resolve';
import { formatTable, truncate } from '../formatters/table';
import { statusIcon, roleIcon, colorize, colors } from '../formatters/icons';

export function registerAgentCommands(program: Command, client: DaemonClient): void {
    const agent = program
        .command('agent')
        .description('Manage AI agents');

    agent
        .command('list')
        .description('List all agents')
        .option('-s, --status <status>', 'Filter by status')
        .option('-r, --role <role>', 'Filter by role')
        .option('-t, --team <team>', 'Filter by team')
        .option('--runtime <runtime>', 'Filter by runtime')
        .option('--json', 'Output JSON')
        .action(async (options) => {
            try {
                await ensureDaemon(client);

                const filters: any = {};
                if (options.status) filters.status = options.status;
                if (options.role) filters.role = options.role;
                if (options.team) filters.team = options.team;
                if (options.runtime) filters.runtime = options.runtime;

                const agents = await client.call('agent.list', filters);

                if (options.json) {
                    output(agents, { json: true });
                } else {
                    if (agents.length === 0) {
                        console.log(colorize('No agents', colors.dim));
                        return;
                    }

                    output(formatTable(agents, [
                        {
                            key: 'id',
                            title: 'ID',
                            width: 10,
                            formatter: (v) => truncate(v, 10)
                        },
                        {
                            key: 'role',
                            title: 'Role',
                            width: 12,
                            formatter: (v) => `${roleIcon(v)} ${v}`
                        },
                        {
                            key: 'status',
                            title: 'Status',
                            width: 12,
                            formatter: (v) => `${statusIcon(v)} ${v}`
                        },
                        {
                            key: 'provider',
                            title: 'Provider',
                            width: 10
                        },
                        {
                            key: 'task',
                            title: 'Task',
                            width: 40,
                            formatter: (v) => truncate(v || '-', 40)
                        }
                    ]));
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('spawn')
        .description('Spawn a new agent')
        .requiredOption('-r, --role <role>', 'Agent role (coder, reviewer, tester, etc.)')
        .argument('<task>', 'Task description')
        .option('-p, --provider <provider>', 'AI provider (claude, gemini, etc.)')
        .option('-w, --workdir <path>', 'Working directory')
        .option('--runtime <runtime>', 'Runtime ID')
        .option('--image <image>', 'Docker image')
        .option('--memory <memory>', 'Memory limit')
        .option('--cpus <cpus>', 'CPU limit', parseFloat)
        .option('-t, --team <team>', 'Team ID')
        .option('--json', 'Output JSON')
        .action(async (task, options) => {
            try {
                await ensureDaemon(client);

                const params: any = {
                    role: options.role,
                    task
                };

                if (options.provider) params.provider = options.provider;
                if (options.workdir) params.workdir = options.workdir;
                if (options.runtime) params.runtime = options.runtime;
                if (options.image) params.image = options.image;
                if (options.memory) params.memory = options.memory;
                if (options.cpus) params.cpus = options.cpus;
                if (options.team) params.team = options.team;

                const result = await client.call('agent.spawn', params);

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Agent spawned: ${colorize(result.id, colors.green)}`);
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('kill')
        .description('Terminate an agent')
        .argument('<id>', 'Agent ID or prefix')
        .action(async (id) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveAgentId(client, id);
                await client.call('agent.kill', { id: fullId });
                console.log(`${statusIcon('success')} Agent terminated: ${fullId}`);
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('send')
        .description('Send prompt to agent')
        .argument('<id>', 'Agent ID or prefix')
        .argument('<prompt>', 'Prompt text')
        .option('--no-wait', 'Don\'t wait for response')
        .action(async (id, prompt, options) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveAgentId(client, id);

                const result = await client.call('agent.sendPrompt', {
                    id: fullId,
                    prompt,
                    wait: options.wait
                });

                if (options.wait && result) {
                    output(result);
                } else {
                    console.log(`${statusIcon('success')} Prompt sent to ${fullId}`);
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('output')
        .description('Get agent terminal output')
        .argument('<id>', 'Agent ID or prefix')
        .option('-n, --lines <n>', 'Number of lines', parseInt, 50)
        .option('-f, --follow', 'Follow output')
        .action(async (id, options) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveAgentId(client, id);

                if (options.follow) {
                    // TODO: Implement streaming
                    error('Follow mode not yet implemented');
                } else {
                    const result = await client.call('agent.getOutput', {
                        id: fullId,
                        lines: options.lines
                    });
                    output(result);
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('attach')
        .description('Get attach command for agent')
        .argument('<id>', 'Agent ID or prefix')
        .action(async (id) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveAgentId(client, id);
                const cmd = await client.call('agent.getAttachCommand', { id: fullId });
                console.log(cmd);
                console.log(colorize('\nRun this command to attach to the agent terminal', colors.dim));
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('status')
        .description('Get agent status')
        .argument('<id>', 'Agent ID or prefix')
        .option('--json', 'Output JSON')
        .action(async (id, options) => {
            try {
                await ensureDaemon(client);
                const fullId = await resolveAgentId(client, id);
                const agentInfo = await client.call('agent.get', { id: fullId });

                if (options.json) {
                    output(agentInfo, { json: true });
                } else {
                    console.log(`${statusIcon(agentInfo.status)} ${colorize(agentInfo.id, colors.bold)}`);
                    console.log(`Role:     ${roleIcon(agentInfo.role)} ${agentInfo.role}`);
                    console.log(`Provider: ${agentInfo.provider}`);
                    console.log(`Status:   ${agentInfo.status}`);
                    if (agentInfo.task) {
                        console.log(`Task:     ${agentInfo.task}`);
                    }
                    if (agentInfo.runtime) {
                        console.log(`Runtime:  ${agentInfo.runtime}`);
                    }
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    agent
        .command('pick')
        .description('Interactive agent picker (fzf)')
        .action(async () => {
            try {
                // TODO: Implement fzf integration
                error('Agent picker not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });
}

import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { formatTable, truncate } from '../formatters/table';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerTeamCommands(program: Command, client: DaemonClient): void {
    const team = program
        .command('team')
        .description('Manage agent teams');

    team
        .command('list')
        .description('List all teams')
        .option('--json', 'Output JSON')
        .action(async (options) => {
            try {
                await ensureDaemon(client);
                const teams = await client.call('team.list', {});

                if (options.json) {
                    output(teams, { json: true });
                } else {
                    if (teams.length === 0) {
                        console.log(colorize('No teams', colors.dim));
                        return;
                    }

                    output(formatTable(teams, [
                        {
                            key: 'id',
                            title: 'ID',
                            width: 10,
                            formatter: (v) => truncate(v, 10)
                        },
                        {
                            key: 'name',
                            title: 'Name',
                            width: 20
                        },
                        {
                            key: 'agents',
                            title: 'Agents',
                            width: 7,
                            align: 'right',
                            formatter: (v) => String(Array.isArray(v) ? v.length : 0)
                        },
                        {
                            key: 'workdir',
                            title: 'Working Directory',
                            width: 30,
                            formatter: (v) => truncate(v || '-', 30)
                        }
                    ]));
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    team
        .command('create')
        .description('Create a new team')
        .argument('<name>', 'Team name')
        .option('--agents <json>', 'Agent configurations (JSON)')
        .option('--workdir <path>', 'Working directory')
        .option('--runtime <runtime>', 'Runtime ID')
        .option('--json', 'Output JSON')
        .action(async (name, options) => {
            try {
                await ensureDaemon(client);

                const params: any = { name };

                if (options.agents) {
                    try {
                        params.agents = JSON.parse(options.agents);
                    } catch {
                        error('Invalid JSON for --agents');
                    }
                } else {
                    params.agents = [];
                }

                if (options.workdir) params.workdir = options.workdir;
                if (options.runtime) params.runtime = options.runtime;

                const result = await client.call('team.create', params);

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Team created: ${colorize(result.id, colors.green)}`);
                    console.log(`Name: ${result.name}`);
                    if (result.agents && result.agents.length > 0) {
                        console.log(`Agents spawned: ${result.agents.length}`);
                    }
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    team
        .command('delete')
        .description('Delete a team')
        .argument('<name>', 'Team name or ID')
        .action(async (name) => {
            try {
                await ensureDaemon(client);
                await client.call('team.delete', { id: name });
                console.log(`${statusIcon('success')} Team deleted`);
            } catch (err: any) {
                error(err.message);
            }
        });

    team
        .command('quick-code')
        .description('Quick start coding team')
        .argument('<workdir>', 'Working directory')
        .option('--runtime <runtime>', 'Runtime ID')
        .option('--json', 'Output JSON')
        .action(async (workdir, options) => {
            try {
                await ensureDaemon(client);

                const params: any = { workdir };
                if (options.runtime) params.runtime = options.runtime;

                const result = await client.call('team.quickCode', params);

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Coding team spawned: ${colorize(result.id, colors.green)}`);
                    console.log(`Agents: ${result.agents.length}`);
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    team
        .command('quick-research')
        .description('Quick start research team')
        .argument('<topic>', 'Research topic')
        .option('--runtime <runtime>', 'Runtime ID')
        .option('--json', 'Output JSON')
        .action(async (topic, options) => {
            try {
                await ensureDaemon(client);

                const params: any = { topic };
                if (options.runtime) params.runtime = options.runtime;

                const result = await client.call('team.quickResearch', params);

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Research team spawned: ${colorize(result.id, colors.green)}`);
                    console.log(`Agents: ${result.agents.length}`);
                }
            } catch (err: any) {
                error(err.message);
            }
        });
}

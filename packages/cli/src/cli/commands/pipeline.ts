import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { formatTable, truncate } from '../formatters/table';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerPipelineCommands(program: Command, client: DaemonClient): void {
    const pipeline = program
        .command('pipeline')
        .description('Manage pipelines');

    pipeline
        .command('list')
        .description('List all pipelines')
        .option('--json', 'Output JSON')
        .action(async (options) => {
            try {
                await ensureDaemon(client);
                const pipelines = await client.call('pipeline.list', {});

                if (options.json) {
                    output(pipelines, { json: true });
                } else {
                    if (pipelines.length === 0) {
                        console.log(colorize('No pipelines', colors.dim));
                        return;
                    }

                    output(formatTable(pipelines, [
                        {
                            key: 'id',
                            title: 'ID',
                            width: 10,
                            formatter: (v) => truncate(v, 10)
                        },
                        {
                            key: 'name',
                            title: 'Name',
                            width: 25,
                            formatter: (v) => v || colorize('(unnamed)', colors.dim)
                        },
                        {
                            key: 'stages',
                            title: 'Stages',
                            width: 7,
                            align: 'right',
                            formatter: (v) => String(Array.isArray(v) ? v.length : 0)
                        },
                        {
                            key: 'description',
                            title: 'Description',
                            width: 40,
                            formatter: (v) => truncate(v || '-', 40)
                        }
                    ]));
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    pipeline
        .command('run')
        .description('Run a pipeline')
        .argument('<id>', 'Pipeline ID or description substring')
        .option('--json', 'Output JSON')
        .action(async (id, options) => {
            try {
                await ensureDaemon(client);

                const result = await client.call('pipeline.run', { id });

                if (options.json) {
                    output(result, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Pipeline started`);
                    console.log(`Run ID: ${colorize(result.runId, colors.green)}`);
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    pipeline
        .command('status')
        .description('Get pipeline run status')
        .argument('<runId>', 'Run ID')
        .option('--json', 'Output JSON')
        .action(async (runId, options) => {
            try {
                await ensureDaemon(client);
                const status = await client.call('pipeline.getStatus', { runId });

                if (options.json) {
                    output(status, { json: true });
                } else {
                    console.log(`${statusIcon(status.status)} Pipeline: ${colorize(runId, colors.bold)}`);
                    console.log(`Status: ${status.status}`);
                    console.log(`Progress: ${status.completedStages || 0}/${status.totalStages || 0}`);

                    if (status.currentStage) {
                        console.log(`Current: ${status.currentStage}`);
                    }

                    if (status.error) {
                        console.log(colorize(`Error: ${status.error}`, colors.red));
                    }
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    pipeline
        .command('cancel')
        .description('Cancel a pipeline run')
        .argument('<runId>', 'Run ID')
        .action(async (runId) => {
            try {
                await ensureDaemon(client);
                await client.call('pipeline.cancel', { runId });
                console.log(`${statusIcon('success')} Pipeline cancelled`);
            } catch (err: any) {
                error(err.message);
            }
        });
}

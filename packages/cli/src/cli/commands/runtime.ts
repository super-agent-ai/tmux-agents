import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { formatTable, truncate } from '../formatters/table';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerRuntimeCommands(program: Command, client: DaemonClient): void {
    const runtime = program
        .command('runtime')
        .description('Manage runtimes');

    runtime
        .command('list')
        .description('List all runtimes')
        .option('--json', 'Output JSON')
        .action(async (options) => {
            try {
                await ensureDaemon(client);
                const runtimes = await client.call('runtime.list', {});

                if (options.json) {
                    output(runtimes, { json: true });
                } else {
                    if (runtimes.length === 0) {
                        console.log(colorize('No runtimes configured', colors.dim));
                        return;
                    }

                    output(formatTable(runtimes, [
                        {
                            key: 'id',
                            title: 'ID',
                            width: 15
                        },
                        {
                            key: 'type',
                            title: 'Type',
                            width: 10
                        },
                        {
                            key: 'status',
                            title: 'Status',
                            width: 12,
                            formatter: (v) => `${statusIcon(v)} ${v}`
                        },
                        {
                            key: 'latency',
                            title: 'Latency',
                            width: 10,
                            align: 'right',
                            formatter: (v) => v ? `${v}ms` : '-'
                        },
                        {
                            key: 'config',
                            title: 'Config',
                            width: 40,
                            formatter: (v) => {
                                if (!v) return '-';
                                const keys = Object.keys(v).slice(0, 3);
                                return truncate(keys.join(', '), 40);
                            }
                        }
                    ]));
                }
            } catch (err: any) {
                error(err.message);
            }
        });

    runtime
        .command('add')
        .description('Add a new runtime')
        .argument('<name>', 'Runtime name/ID')
        .requiredOption('--type <type>', 'Runtime type (docker, k8s, ssh)')
        .option('--host <host>', 'Host (for SSH)')
        .option('--image <image>', 'Default image (for Docker/K8s)')
        .option('--namespace <namespace>', 'Namespace (for K8s)')
        .action(async (name, options) => {
            try {
                await ensureDaemon(client);

                const params: any = {
                    id: name,
                    type: options.type
                };

                if (options.host) params.host = options.host;
                if (options.image) params.image = options.image;
                if (options.namespace) params.namespace = options.namespace;

                await client.call('runtime.add', params);
                console.log(`${statusIcon('success')} Runtime added: ${colorize(name, colors.green)}`);
            } catch (err: any) {
                error(err.message);
            }
        });

    runtime
        .command('remove')
        .description('Remove a runtime')
        .argument('<name>', 'Runtime name/ID')
        .action(async (name) => {
            try {
                await ensureDaemon(client);
                await client.call('runtime.remove', { id: name });
                console.log(`${statusIcon('success')} Runtime removed`);
            } catch (err: any) {
                error(err.message);
            }
        });
}

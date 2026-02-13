"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRuntimeCommands = registerRuntimeCommands;
const output_1 = require("../util/output");
const daemon_guard_1 = require("../util/daemon-guard");
const table_1 = require("../formatters/table");
const icons_1 = require("../formatters/icons");
function registerRuntimeCommands(program, client) {
    const runtime = program
        .command('runtime')
        .description('Manage runtimes');
    runtime
        .command('list')
        .description('List all runtimes')
        .option('--json', 'Output JSON')
        .action(async (options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const runtimes = await client.call('runtime.list', {});
            if (options.json) {
                (0, output_1.output)(runtimes, { json: true });
            }
            else {
                if (runtimes.length === 0) {
                    console.log((0, icons_1.colorize)('No runtimes configured', icons_1.colors.dim));
                    return;
                }
                (0, output_1.output)((0, table_1.formatTable)(runtimes, [
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
                        formatter: (v) => `${(0, icons_1.statusIcon)(v)} ${v}`
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
                            if (!v)
                                return '-';
                            const keys = Object.keys(v).slice(0, 3);
                            return (0, table_1.truncate)(keys.join(', '), 40);
                        }
                    }
                ]));
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
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
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = {
                id: name,
                type: options.type
            };
            if (options.host)
                params.host = options.host;
            if (options.image)
                params.image = options.image;
            if (options.namespace)
                params.namespace = options.namespace;
            await client.call('runtime.add', params);
            console.log(`${(0, icons_1.statusIcon)('success')} Runtime added: ${(0, icons_1.colorize)(name, icons_1.colors.green)}`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    runtime
        .command('remove')
        .description('Remove a runtime')
        .argument('<name>', 'Runtime name/ID')
        .action(async (name) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            await client.call('runtime.remove', { id: name });
            console.log(`${(0, icons_1.statusIcon)('success')} Runtime removed`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=runtime.js.map
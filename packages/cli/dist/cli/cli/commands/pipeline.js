"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPipelineCommands = registerPipelineCommands;
const output_1 = require("../util/output");
const daemon_guard_1 = require("../util/daemon-guard");
const table_1 = require("../formatters/table");
const icons_1 = require("../formatters/icons");
function registerPipelineCommands(program, client) {
    const pipeline = program
        .command('pipeline')
        .description('Manage pipelines');
    pipeline
        .command('list')
        .description('List all pipelines')
        .option('--json', 'Output JSON')
        .action(async (options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const pipelines = await client.call('pipeline.list', {});
            if (options.json) {
                (0, output_1.output)(pipelines, { json: true });
            }
            else {
                if (pipelines.length === 0) {
                    console.log((0, icons_1.colorize)('No pipelines', icons_1.colors.dim));
                    return;
                }
                (0, output_1.output)((0, table_1.formatTable)(pipelines, [
                    {
                        key: 'id',
                        title: 'ID',
                        width: 10,
                        formatter: (v) => (0, table_1.truncate)(v, 10)
                    },
                    {
                        key: 'name',
                        title: 'Name',
                        width: 25,
                        formatter: (v) => v || (0, icons_1.colorize)('(unnamed)', icons_1.colors.dim)
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
                        formatter: (v) => (0, table_1.truncate)(v || '-', 40)
                    }
                ]));
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    pipeline
        .command('run')
        .description('Run a pipeline')
        .argument('<id>', 'Pipeline ID or description substring')
        .option('--json', 'Output JSON')
        .action(async (id, options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const result = await client.call('pipeline.run', { id });
            if (options.json) {
                (0, output_1.output)(result, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Pipeline started`);
                console.log(`Run ID: ${(0, icons_1.colorize)(result.runId, icons_1.colors.green)}`);
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    pipeline
        .command('status')
        .description('Get pipeline run status')
        .argument('<runId>', 'Run ID')
        .option('--json', 'Output JSON')
        .action(async (runId, options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const status = await client.call('pipeline.getStatus', { runId });
            if (options.json) {
                (0, output_1.output)(status, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)(status.status)} Pipeline: ${(0, icons_1.colorize)(runId, icons_1.colors.bold)}`);
                console.log(`Status: ${status.status}`);
                console.log(`Progress: ${status.completedStages || 0}/${status.totalStages || 0}`);
                if (status.currentStage) {
                    console.log(`Current: ${status.currentStage}`);
                }
                if (status.error) {
                    console.log((0, icons_1.colorize)(`Error: ${status.error}`, icons_1.colors.red));
                }
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    pipeline
        .command('cancel')
        .description('Cancel a pipeline run')
        .argument('<runId>', 'Run ID')
        .action(async (runId) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            await client.call('pipeline.cancel', { runId });
            console.log(`${(0, icons_1.statusIcon)('success')} Pipeline cancelled`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=pipeline.js.map
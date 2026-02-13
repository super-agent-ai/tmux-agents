"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTeamCommands = registerTeamCommands;
const output_1 = require("../util/output");
const daemon_guard_1 = require("../util/daemon-guard");
const table_1 = require("../formatters/table");
const icons_1 = require("../formatters/icons");
function registerTeamCommands(program, client) {
    const team = program
        .command('team')
        .description('Manage agent teams');
    team
        .command('list')
        .description('List all teams')
        .option('--json', 'Output JSON')
        .action(async (options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const teams = await client.call('team.list', {});
            if (options.json) {
                (0, output_1.output)(teams, { json: true });
            }
            else {
                if (teams.length === 0) {
                    console.log((0, icons_1.colorize)('No teams', icons_1.colors.dim));
                    return;
                }
                (0, output_1.output)((0, table_1.formatTable)(teams, [
                    {
                        key: 'id',
                        title: 'ID',
                        width: 10,
                        formatter: (v) => (0, table_1.truncate)(v, 10)
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
                        formatter: (v) => (0, table_1.truncate)(v || '-', 30)
                    }
                ]));
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
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
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = { name };
            if (options.agents) {
                try {
                    params.agents = JSON.parse(options.agents);
                }
                catch {
                    (0, output_1.error)('Invalid JSON for --agents');
                }
            }
            else {
                params.agents = [];
            }
            if (options.workdir)
                params.workdir = options.workdir;
            if (options.runtime)
                params.runtime = options.runtime;
            const result = await client.call('team.create', params);
            if (options.json) {
                (0, output_1.output)(result, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Team created: ${(0, icons_1.colorize)(result.id, icons_1.colors.green)}`);
                console.log(`Name: ${result.name}`);
                if (result.agents && result.agents.length > 0) {
                    console.log(`Agents spawned: ${result.agents.length}`);
                }
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    team
        .command('delete')
        .description('Delete a team')
        .argument('<name>', 'Team name or ID')
        .action(async (name) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            await client.call('team.delete', { id: name });
            console.log(`${(0, icons_1.statusIcon)('success')} Team deleted`);
        }
        catch (err) {
            (0, output_1.error)(err.message);
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
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = { workdir };
            if (options.runtime)
                params.runtime = options.runtime;
            const result = await client.call('team.quickCode', params);
            if (options.json) {
                (0, output_1.output)(result, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Coding team spawned: ${(0, icons_1.colorize)(result.id, icons_1.colors.green)}`);
                console.log(`Agents: ${result.agents.length}`);
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
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
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = { topic };
            if (options.runtime)
                params.runtime = options.runtime;
            const result = await client.call('team.quickResearch', params);
            if (options.json) {
                (0, output_1.output)(result, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Research team spawned: ${(0, icons_1.colorize)(result.id, icons_1.colors.green)}`);
                console.log(`Agents: ${result.agents.length}`);
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=team.js.map
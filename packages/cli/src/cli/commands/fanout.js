"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFanoutCommand = registerFanoutCommand;
const output_1 = require("../util/output");
const daemon_guard_1 = require("../util/daemon-guard");
const icons_1 = require("../formatters/icons");
function registerFanoutCommand(program, client) {
    program
        .command('fan-out')
        .description('Fan-out prompt to multiple agents')
        .argument('<prompt>', 'Prompt to send to all agents')
        .option('-n, --count <n>', 'Number of agents', parseInt, 3)
        .option('-p, --provider <provider>', 'AI provider')
        .option('--runtime <runtime>', 'Runtime ID')
        .option('--json', 'Output JSON')
        .action(async (prompt, options) => {
        try {
            await (0, daemon_guard_1.ensureDaemon)(client);
            const params = { prompt };
            if (options.count)
                params.count = options.count;
            if (options.provider)
                params.provider = options.provider;
            if (options.runtime)
                params.runtime = options.runtime;
            const results = await client.call('fanout.run', params);
            if (options.json) {
                (0, output_1.output)(results, { json: true });
            }
            else {
                console.log(`${(0, icons_1.statusIcon)('success')} Fan-out complete`);
                console.log(`Agents spawned: ${(0, icons_1.colorize)(results.length, icons_1.colors.green)}`);
                results.forEach((agentId, i) => {
                    console.log(`  ${i + 1}. ${agentId}`);
                });
            }
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=fanout.js.map
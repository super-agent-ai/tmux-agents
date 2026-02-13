import { Command } from 'commander';
import { DaemonClient } from '../../client';
import { output, error } from '../util/output';
import { ensureDaemon } from '../util/daemon-guard';
import { statusIcon, colorize, colors } from '../formatters/icons';

export function registerFanoutCommand(program: Command, client: DaemonClient): void {
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
                await ensureDaemon(client);

                const params: any = { prompt };
                if (options.count) params.count = options.count;
                if (options.provider) params.provider = options.provider;
                if (options.runtime) params.runtime = options.runtime;

                const results = await client.call('fanout.run', params);

                if (options.json) {
                    output(results, { json: true });
                } else {
                    console.log(`${statusIcon('success')} Fan-out complete`);
                    console.log(`Agents spawned: ${colorize(results.length, colors.green)}`);

                    results.forEach((agentId: string, i: number) => {
                        console.log(`  ${i + 1}. ${agentId}`);
                    });
                }
            } catch (err: any) {
                error(err.message);
            }
        });
}

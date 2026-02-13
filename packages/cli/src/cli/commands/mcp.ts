import { Command } from 'commander';
import { error } from '../util/output';

export function registerMcpCommand(program: Command): void {
    program
        .command('mcp')
        .description('Start MCP server (stdio mode)')
        .action(async () => {
            try {
                // TODO: Implement MCP server startup
                error('MCP server not yet implemented');
            } catch (err: any) {
                error(err.message);
            }
        });
}

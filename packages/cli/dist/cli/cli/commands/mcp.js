"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMcpCommand = registerMcpCommand;
const output_1 = require("../util/output");
function registerMcpCommand(program) {
    program
        .command('mcp')
        .description('Start MCP server (stdio mode)')
        .action(async () => {
        try {
            // TODO: Implement MCP server startup
            (0, output_1.error)('MCP server not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=mcp.js.map
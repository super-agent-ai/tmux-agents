"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerServiceCommands = registerServiceCommands;
const output_1 = require("../util/output");
function registerServiceCommands(program) {
    const service = program
        .command('service')
        .description('Manage system service (launchd/systemd)');
    service
        .command('install')
        .description('Install system service')
        .action(async () => {
        try {
            // TODO: Implement service installation
            (0, output_1.error)('Service install not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    service
        .command('uninstall')
        .description('Uninstall system service')
        .action(async () => {
        try {
            // TODO: Implement service uninstallation
            (0, output_1.error)('Service uninstall not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
    service
        .command('status')
        .description('Check service status')
        .action(async () => {
        try {
            // TODO: Implement service status check
            (0, output_1.error)('Service status not yet implemented');
        }
        catch (err) {
            (0, output_1.error)(err.message);
        }
    });
}
//# sourceMappingURL=service.js.map
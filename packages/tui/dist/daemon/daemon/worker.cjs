#!/usr/bin/env node
"use strict";
// Worker process entry point - forked by supervisor
// This file runs the main daemon server
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server.cjs");
// Get config path from args if provided
const args = process.argv.slice(2);
const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined;
// Run the daemon
(0, server_1.runDaemon)(configPath).catch((err) => {
    console.error('Fatal error in daemon worker:', err);
    process.exit(1);
});
//# sourceMappingURL=worker.js.map
#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// Main CLI entry point for daemon commands
__exportStar(require("./supervisor.cjs"), exports);
__exportStar(require("./server.cjs"), exports);
__exportStar(require("./config.cjs"), exports);
__exportStar(require("./log.cjs"), exports);
// Run supervisor if executed directly
if (require.main === module) {
    const { main } = require("./supervisor.cjs");
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map
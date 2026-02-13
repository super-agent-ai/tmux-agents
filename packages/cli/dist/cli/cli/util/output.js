"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.output = output;
exports.error = error;
exports.success = success;
function output(data, options = {}) {
    if (options.json) {
        console.log(JSON.stringify(data, null, 2));
    }
    else if (typeof data === 'string') {
        console.log(data);
    }
    else if (data === null || data === undefined) {
        // Silent for void/null results
    }
    else {
        console.log(data);
    }
}
function error(message, exitCode = 1) {
    console.error(message);
    process.exit(exitCode);
}
function success(message) {
    if (message) {
        console.log(message);
    }
    process.exit(0);
}
//# sourceMappingURL=output.js.map
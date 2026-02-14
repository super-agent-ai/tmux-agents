"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveId = resolveId;
exports.resolveAgentId = resolveAgentId;
exports.resolveTaskId = resolveTaskId;
function resolveId(items, prefix) {
    const matches = items.filter(item => item.id.startsWith(prefix));
    if (matches.length === 0) {
        throw new Error(`No match found for ID prefix: ${prefix}`);
    }
    if (matches.length > 1) {
        throw new Error(`Ambiguous ID prefix: ${prefix} (matches ${matches.length} items)`);
    }
    return matches[0].id;
}
async function resolveAgentId(client, prefix) {
    const agents = await client.call('agent.list', {});
    return resolveId(agents, prefix);
}
async function resolveTaskId(client, prefix) {
    const tasks = await client.call('task.list', {});
    return resolveId(tasks, prefix);
}
//# sourceMappingURL=resolve.js.map
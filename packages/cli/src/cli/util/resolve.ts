export function resolveId(items: Array<{ id: string }>, prefix: string): string {
    const matches = items.filter(item => item.id.startsWith(prefix));

    if (matches.length === 0) {
        throw new Error(`No match found for ID prefix: ${prefix}`);
    }

    if (matches.length > 1) {
        throw new Error(`Ambiguous ID prefix: ${prefix} (matches ${matches.length} items)`);
    }

    return matches[0].id;
}

export async function resolveAgentId(client: any, prefix: string): Promise<string> {
    const agents = await client.call('agent.list', {});
    return resolveId(agents, prefix);
}

export async function resolveTaskId(client: any, prefix: string): Promise<string> {
    const tasks = await client.call('task.list', {});
    return resolveId(tasks, prefix);
}

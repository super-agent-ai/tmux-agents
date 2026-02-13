import { KanbanSwimLane } from './types';
import { TmuxService } from './tmuxService';

// ─── Path Resolution ────────────────────────────────────────────────────────

/**
 * Resolve the full path to a swim lane's memory file.
 * Returns undefined if the lane has no memoryFileId.
 */
export function getMemoryFilePath(lane: KanbanSwimLane): string | undefined {
    if (!lane.memoryFileId) { return undefined; }
    const dir = lane.memoryPath || `${lane.workingDirectory}/memory`;
    return `${dir}/${lane.memoryFileId}.md`;
}

/**
 * Resolve the directory that contains the memory file.
 */
export function getMemoryDir(lane: KanbanSwimLane): string | undefined {
    if (!lane.memoryFileId) { return undefined; }
    return lane.memoryPath || `${lane.workingDirectory}/memory`;
}

// ─── File I/O (via TmuxService for local + SSH) ────────────────────────────

/**
 * Ensure the memory directory exists on the target server.
 */
export async function ensureMemoryDir(service: TmuxService, lane: KanbanSwimLane): Promise<void> {
    const dir = getMemoryDir(lane);
    if (!dir) { return; }
    await service.execCommand(`mkdir -p ${JSON.stringify(dir)}`);
}

/**
 * Read the memory file contents from the target server.
 * Returns empty string if the file does not exist.
 */
export async function readMemoryFile(service: TmuxService, lane: KanbanSwimLane): Promise<string> {
    const filePath = getMemoryFilePath(lane);
    if (!filePath) { return ''; }
    try {
        const content = await service.execCommand(`cat ${JSON.stringify(filePath)} 2>/dev/null || true`);
        return content.trim();
    } catch {
        return '';
    }
}

// ─── Prompt Building ────────────────────────────────────────────────────────

/**
 * Build the "memory load" prompt section — injected early so the AI has
 * accumulated context before starting the task.
 */
export function buildMemoryLoadPrompt(memoryContent: string, filePath: string): string {
    const parts: string[] = [];
    parts.push('--- Long-Term Memory ---');
    parts.push(`Memory file: ${filePath}`);
    if (memoryContent) {
        parts.push('');
        parts.push('Below is the accumulated memory from previous tasks in this swim lane.');
        parts.push('Use this context to avoid re-discovering known information and to build on prior work.');
        parts.push('');
        parts.push(memoryContent);
    } else {
        parts.push('');
        parts.push('No previous memory exists yet. This is the first task in this lane with memory enabled.');
    }
    parts.push('--- End Memory ---');
    return parts.join('\n');
}

/**
 * Build the "memory save" prompt section — injected late so the AI updates
 * the memory file as one of its final actions.
 */
export function buildMemorySavePrompt(filePath: string): string {
    const parts: string[] = [];
    parts.push('--- Memory Update Instructions ---');
    parts.push(`Before you finish, update the long-term memory file at: ${filePath}`);
    parts.push('');
    parts.push('Write the FULL updated memory (not just a diff). Keep it under 200 lines. Include:');
    parts.push('1. **Essential changes**: Key files created/modified and why');
    parts.push('2. **Major updates**: Architecture decisions, patterns established');
    parts.push('3. **Current state**: Build/test status, what works and what does not');
    parts.push('4. **Log locations**: Where to find relevant logs or output');
    parts.push('5. **Conventions**: Coding patterns, naming conventions discovered');
    parts.push('');
    parts.push('Overwrite outdated information — the file should reflect the current project state.');
    parts.push('--- End Memory Instructions ---');
    return parts.join('\n');
}

import { OrchestratorTask, KanbanSwimLane } from './types';

/**
 * Build a rich context prompt for a single task.
 */
export function buildSingleTaskPrompt(t: OrchestratorTask, lane?: KanbanSwimLane): string {
    const sections: string[] = [];

    sections.push(`Implement the following task:`);
    sections.push(``);

    // Core identity
    sections.push(`Task ID: ${t.id}`);
    sections.push(`Title: ${t.description}`);

    if (t.input) {
        sections.push(`\nDescription / Details:\n${t.input}`);
    }

    // Metadata
    if (t.targetRole) { sections.push(`Role: ${t.targetRole}`); }
    if (t.priority && t.priority !== 5) { sections.push(`Priority: ${t.priority}/10`); }

    // Swim lane context
    if (lane) {
        sections.push(``);
        sections.push(`--- Project Context ---`);
        sections.push(`Project: ${lane.name}`);
        if (lane.workingDirectory) { sections.push(`Working Directory: ${lane.workingDirectory}`); }
        if (lane.contextInstructions) {
            sections.push(`\nContext / Instructions:\n${lane.contextInstructions}`);
        }
    }

    // Parent task context
    if (t.parentTaskId) {
        sections.push(`\nNote: This is a subtask of parent task ${t.parentTaskId}.`);
    }

    return sections.join('\n');
}

/**
 * Build a rich context prompt for a task box (parent with subtasks).
 */
export function buildTaskBoxPrompt(parent: OrchestratorTask, subtasks: OrchestratorTask[], lane?: KanbanSwimLane): string {
    const sections: string[] = [];

    sections.push(`Implement the following ${subtasks.length} tasks together:`);

    // Parent context
    if (parent.description) {
        sections.push(`\nParent Task: ${parent.description}`);
    }
    if (parent.input) {
        sections.push(`Parent Details: ${parent.input}`);
    }

    // Each subtask
    for (let i = 0; i < subtasks.length; i++) {
        const sub = subtasks[i];
        sections.push(`\n--- Task ${i + 1} ---`);
        sections.push(`Task ID: ${sub.id}`);
        sections.push(`Title: ${sub.description}`);
        if (sub.input) { sections.push(`Description / Details:\n${sub.input}`); }
        if (sub.targetRole) { sections.push(`Role: ${sub.targetRole}`); }
    }

    sections.push(`\nAll tasks should be completed together in this session. Coordinate the work across all tasks.`);

    // Swim lane context
    if (lane) {
        sections.push(``);
        sections.push(`--- Project Context ---`);
        sections.push(`Project: ${lane.name}`);
        if (lane.workingDirectory) { sections.push(`Working Directory: ${lane.workingDirectory}`); }
        if (lane.contextInstructions) {
            sections.push(`\nContext / Instructions:\n${lane.contextInstructions}`);
        }
    }

    return sections.join('\n');
}

/**
 * Build a rich context prompt for a bundle task (one of many running in parallel).
 */
export function buildBundleTaskPrompt(t: OrchestratorTask, otherTasks: OrchestratorTask[], lane?: KanbanSwimLane): string {
    const sections: string[] = [];

    sections.push(`Implement the following task:`);
    sections.push(``);

    sections.push(`Task ID: ${t.id}`);
    sections.push(`Title: ${t.description}`);

    if (t.input) {
        sections.push(`\nDescription / Details:\n${t.input}`);
    }

    if (t.targetRole) { sections.push(`Role: ${t.targetRole}`); }
    if (t.priority && t.priority !== 5) { sections.push(`Priority: ${t.priority}/10`); }

    // Bundle context
    if (otherTasks.length > 0) {
        sections.push(`\n--- Parallel Tasks (for awareness) ---`);
        sections.push(`This task is part of a bundle with ${otherTasks.length} other tasks running in parallel:`);
        for (const ot of otherTasks) {
            const desc = ot.input ? ` - ${ot.input.slice(0, 100)}` : '';
            sections.push(`- [${ot.id.slice(0, 12)}] ${ot.description}${desc}`);
        }
        sections.push(`Coordinate with the other tasks if relevant.`);
    }

    // Swim lane context
    if (lane) {
        sections.push(``);
        sections.push(`--- Project Context ---`);
        sections.push(`Project: ${lane.name}`);
        if (lane.workingDirectory) { sections.push(`Working Directory: ${lane.workingDirectory}`); }
        if (lane.contextInstructions) {
            sections.push(`\nContext / Instructions:\n${lane.contextInstructions}`);
        }
    }

    if (t.parentTaskId) {
        sections.push(`\nNote: This is a subtask of parent task ${t.parentTaskId}.`);
    }

    return sections.join('\n');
}

/**
 * Append standard tail options to a prompt.
 */
export function appendPromptTail(prompt: string, options?: {
    additionalInstructions?: string;
    askForContext?: boolean;
    autoClose?: boolean;
    signalId?: string;
}): string {
    if (options?.additionalInstructions) {
        prompt += `\n\nAdditional instructions: ${options.additionalInstructions}`;
    }
    if (options?.askForContext) {
        prompt += `\n\nBefore starting, ask the user if they have any additional context or requirements for this task.`;
    } else {
        prompt += `\n\nStart implementing immediately without asking for confirmation.`;
    }
    if (options?.autoClose && options?.signalId) {
        prompt += `\n\nIMPORTANT: When you have completed ALL the work for this task, output a brief summary of what you did followed by the completion signal, exactly in this format:\n<promise-summary>${options.signalId}\nYour summary of what was accomplished (2-5 sentences)\n</promise-summary>\n<promise>${options.signalId}-DONE</promise>\nThese signals will be detected automatically. Only output them when you are fully done.`;
    }
    return prompt;
}

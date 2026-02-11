import { OrchestratorTask, KanbanSwimLane, AgentPersona } from './types';

/**
 * Build a rich context prompt for a single task.
 */
export function buildSingleTaskPrompt(t: OrchestratorTask, lane?: KanbanSwimLane): string {
    const sections: string[] = [];

    sections.push(`Implement the following task. Read existing code before modifying files. Work within the project's working directory. Test your changes if a test framework is available.`);
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

    sections.push(`Implement the following ${subtasks.length} tasks together in this session. Complete them in dependency order — if a later task depends on an earlier one's output, finish the earlier task first. Note what each task produced (files changed, outputs) so subsequent tasks can build on it.`);

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

    sections.push(`\nAll tasks should be completed together in this session.`);

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

    sections.push(`Implement the following task. Read existing code before modifying files. Work within the project's working directory.`);
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
        sections.push(`Avoid modifying the same files as parallel tasks. Coordinate through the shared working directory.`);
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
 * Build persona context string for injection into prompts.
 */
export function buildPersonaContext(persona: AgentPersona): string {
    const parts: string[] = ['## Agent Identity'];
    parts.push(`Personality: ${persona.personality}`);
    parts.push(`Communication style: ${persona.communicationStyle}`);
    parts.push(`Skill level: ${persona.skillLevel}`);
    parts.push(`Risk tolerance: ${persona.riskTolerance}`);
    if (persona.expertiseAreas.length > 0) {
        parts.push(`Expertise: ${persona.expertiseAreas.join(', ')}`);
    }
    if (persona.background) {
        parts.push(`Background: ${persona.background}`);
    }

    // Add behavioral instructions based on persona traits
    parts.push('');
    parts.push('## Behavioral Guidelines');
    switch (persona.personality) {
        case 'methodical':
            parts.push('- Follow a structured, step-by-step approach');
            parts.push('- Document your reasoning before making changes');
            parts.push('- Verify each step before proceeding to the next');
            break;
        case 'creative':
            parts.push('- Consider unconventional approaches and novel solutions');
            parts.push('- Think outside the box while staying within project constraints');
            parts.push('- Explore alternative implementations before settling on one');
            break;
        case 'pragmatic':
            parts.push('- Focus on the simplest solution that works');
            parts.push('- Prioritize shipping over perfection');
            parts.push('- Make practical tradeoffs when needed');
            break;
        case 'analytical':
            parts.push('- Analyze the problem thoroughly before coding');
            parts.push('- Consider edge cases and failure modes upfront');
            parts.push('- Use data and evidence to guide decisions');
            break;
    }

    switch (persona.communicationStyle) {
        case 'concise':
            parts.push('- Keep explanations brief and to the point');
            break;
        case 'detailed':
            parts.push('- Provide thorough explanations of your approach and reasoning');
            break;
        case 'socratic':
            parts.push('- Ask clarifying questions when requirements are ambiguous');
            parts.push('- Guide toward solutions rather than jumping to implementation');
            break;
    }

    switch (persona.riskTolerance) {
        case 'conservative':
            parts.push('- Prefer well-tested, established patterns');
            parts.push('- Avoid experimental approaches unless explicitly requested');
            break;
        case 'moderate':
            parts.push('- Balance proven approaches with reasonable experimentation');
            break;
        case 'experimental':
            parts.push('- Open to trying new approaches and cutting-edge solutions');
            parts.push('- Document risks when using experimental approaches');
            break;
    }

    return parts.join('\n');
}

/**
 * Build a structured prompt for a debug session in a swim lane.
 */
export function buildDebugPrompt(lane: KanbanSwimLane): string {
    const sections: string[] = [];

    sections.push(`You are a debug / exploration assistant for the project below. Help the user investigate issues, run commands, and explore the codebase.`);
    sections.push(``);

    sections.push(`--- Project Context ---`);
    sections.push(`Project: ${lane.name}`);
    if (lane.workingDirectory) { sections.push(`Working Directory: ${lane.workingDirectory}`); }

    if (lane.contextInstructions) {
        sections.push(``);
        sections.push(`--- Swim Lane Instructions ---`);
        sections.push(lane.contextInstructions);
    }

    sections.push(``);
    sections.push(`Follow the instructions above for all work in this session. Await further directions from the user.`);

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
    personaContext?: string;
    guildContext?: string;
}): string {
    if (options?.personaContext) {
        prompt += `\n\n${options.personaContext}`;
    }
    if (options?.guildContext) {
        prompt += `\n\n${options.guildContext}`;
    }
    if (options?.additionalInstructions) {
        prompt += `\n\nAdditional instructions: ${options.additionalInstructions}`;
    }
    if (options?.askForContext) {
        prompt += `\n\nBefore starting, ask the user if they have any additional context or requirements for this task.`;
    } else {
        prompt += `\n\nStart implementing immediately without asking for confirmation.`;
    }
    if (options?.autoClose && options?.signalId) {
        prompt += `\n\nIMPORTANT: When you have completed ALL the work for this task, output a brief summary of what you did followed by the completion signal, exactly in this format:\n<promise-summary>${options.signalId}\nYour summary of what was accomplished (2-5 sentences). Include: files created or modified, whether tests pass, and any remaining issues.\n</promise-summary>\n<promise>${options.signalId}-DONE</promise>\nThese signals will be detected automatically. Only output them when you are fully done.`;
    }
    return prompt;
}

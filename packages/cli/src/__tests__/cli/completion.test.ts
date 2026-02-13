import { describe, it, expect } from 'vitest';
import { generateBashCompletion } from '../../cli/completion/bash';
import { generateZshCompletion } from '../../cli/completion/zsh';
import { generateFishCompletion } from '../../cli/completion/fish';

describe('Completion Scripts', () => {
    const programName = 'tmux-agents';

    it('should generate bash completion', () => {
        const result = generateBashCompletion(programName);

        expect(result).toContain('_tmux-agents_completions');
        expect(result).toContain('complete -F');
        expect(result).toContain('daemon');
        expect(result).toContain('agent');
        expect(result).toContain('task');
    });

    it('should generate zsh completion', () => {
        const result = generateZshCompletion(programName);

        expect(result).toContain('#compdef tmux-agents');
        expect(result).toContain('_tmux-agents()');
        expect(result).toContain('daemon:Manage daemon');
        expect(result).toContain('agent:Manage agents');
    });

    it('should generate fish completion', () => {
        const result = generateFishCompletion(programName);

        expect(result).toContain('complete -c tmux-agents');
        expect(result).toContain('daemon');
        expect(result).toContain('agent');
        expect(result).toContain('task');
    });

    it('bash completion should be valid shell script', () => {
        const result = generateBashCompletion(programName);

        // Check for basic shell syntax
        expect(result).not.toContain('undefined');
        expect(result).toMatch(/\w+\(\)/); // Function definition
    });
});

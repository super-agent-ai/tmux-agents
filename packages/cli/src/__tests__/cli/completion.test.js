"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bash_1 = require("../../cli/completion/bash");
const zsh_1 = require("../../cli/completion/zsh");
const fish_1 = require("../../cli/completion/fish");
(0, vitest_1.describe)('Completion Scripts', () => {
    const programName = 'tmux-agents';
    (0, vitest_1.it)('should generate bash completion', () => {
        const result = (0, bash_1.generateBashCompletion)(programName);
        (0, vitest_1.expect)(result).toContain('_tmux-agents_completions');
        (0, vitest_1.expect)(result).toContain('complete -F');
        (0, vitest_1.expect)(result).toContain('daemon');
        (0, vitest_1.expect)(result).toContain('agent');
        (0, vitest_1.expect)(result).toContain('task');
    });
    (0, vitest_1.it)('should generate zsh completion', () => {
        const result = (0, zsh_1.generateZshCompletion)(programName);
        (0, vitest_1.expect)(result).toContain('#compdef tmux-agents');
        (0, vitest_1.expect)(result).toContain('_tmux-agents()');
        (0, vitest_1.expect)(result).toContain('daemon:Manage daemon');
        (0, vitest_1.expect)(result).toContain('agent:Manage agents');
    });
    (0, vitest_1.it)('should generate fish completion', () => {
        const result = (0, fish_1.generateFishCompletion)(programName);
        (0, vitest_1.expect)(result).toContain('complete -c tmux-agents');
        (0, vitest_1.expect)(result).toContain('daemon');
        (0, vitest_1.expect)(result).toContain('agent');
        (0, vitest_1.expect)(result).toContain('task');
    });
    (0, vitest_1.it)('bash completion should be valid shell script', () => {
        const result = (0, bash_1.generateBashCompletion)(programName);
        // Check for basic shell syntax
        (0, vitest_1.expect)(result).not.toContain('undefined');
        (0, vitest_1.expect)(result).toMatch(/\w+\(\)/); // Function definition
    });
});
//# sourceMappingURL=completion.test.js.map
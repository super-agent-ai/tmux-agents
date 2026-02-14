import { ProcessCategory } from './types';
const PATTERN_RULES = [
    // ── BUILDING ────────────────────────────────────────────────────────
    { pattern: /\bninja\b/, category: ProcessCategory.BUILDING, label: 'ninja' },
    { pattern: /\bbazel\s+build\b/, category: ProcessCategory.BUILDING, label: 'bazel build' },
    { pattern: /\bcmake\b/, category: ProcessCategory.BUILDING, label: 'cmake' },
    { pattern: /\bmake\b/, category: ProcessCategory.BUILDING, label: 'make' },
    { pattern: /\bgcc\b/, category: ProcessCategory.BUILDING, label: 'gcc' },
    { pattern: /\bg\+\+\b/, category: ProcessCategory.BUILDING, label: 'g++' },
    { pattern: /\bclang\b/, category: ProcessCategory.BUILDING, label: 'clang' },
    { pattern: /\brustc\b/, category: ProcessCategory.BUILDING, label: 'rustc' },
    { pattern: /\bcargo\s+build\b/, category: ProcessCategory.BUILDING, label: 'cargo build' },
    { pattern: /\bgo\s+build\b/, category: ProcessCategory.BUILDING, label: 'go build' },
    { pattern: /\bjavac\b/, category: ProcessCategory.BUILDING, label: 'javac' },
    { pattern: /\bnpm\s+run\s+build\b/, category: ProcessCategory.BUILDING, label: 'npm run build' },
    { pattern: /\bwebpack\b/, category: ProcessCategory.BUILDING, label: 'webpack' },
    { pattern: /\btsc\b/, category: ProcessCategory.BUILDING, label: 'tsc' },
    { pattern: /\bgradle\b(?!.*\btest\b)/, category: ProcessCategory.BUILDING, label: 'gradle' },
    { pattern: /\bmvn\s+compile\b/, category: ProcessCategory.BUILDING, label: 'mvn compile' },
    { pattern: /\bvite\s+build\b/, category: ProcessCategory.BUILDING, label: 'vite build' },
    { pattern: /\besbuild\b/, category: ProcessCategory.BUILDING, label: 'esbuild' },
    { pattern: /\brollup\b/, category: ProcessCategory.BUILDING, label: 'rollup' },
    { pattern: /\bturbo\s+build\b/, category: ProcessCategory.BUILDING, label: 'turbo build' },
    // ── TESTING ─────────────────────────────────────────────────────────
    { pattern: /\bpytest\b/, category: ProcessCategory.TESTING, label: 'pytest' },
    { pattern: /\bjest\b/, category: ProcessCategory.TESTING, label: 'jest' },
    { pattern: /\bmocha\b/, category: ProcessCategory.TESTING, label: 'mocha' },
    { pattern: /\bcargo\s+test\b/, category: ProcessCategory.TESTING, label: 'cargo test' },
    { pattern: /\bgo\s+test\b/, category: ProcessCategory.TESTING, label: 'go test' },
    { pattern: /\bnpm\s+test\b/, category: ProcessCategory.TESTING, label: 'npm test' },
    { pattern: /\bnpx\s+test\b/, category: ProcessCategory.TESTING, label: 'npx test' },
    { pattern: /\bvitest\b/, category: ProcessCategory.TESTING, label: 'vitest' },
    { pattern: /\bplaywright\b/, category: ProcessCategory.TESTING, label: 'playwright' },
    { pattern: /\bcypress\b/, category: ProcessCategory.TESTING, label: 'cypress' },
    { pattern: /\brspec\b/, category: ProcessCategory.TESTING, label: 'rspec' },
    { pattern: /\bphpunit\b/, category: ProcessCategory.TESTING, label: 'phpunit' },
    { pattern: /\bjunit\b/, category: ProcessCategory.TESTING, label: 'junit' },
    { pattern: /\bgradle\s+test\b/, category: ProcessCategory.TESTING, label: 'gradle test' },
    { pattern: /\bmvn\s+test\b/, category: ProcessCategory.TESTING, label: 'mvn test' },
    { pattern: /\bkarma\b/, category: ProcessCategory.TESTING, label: 'karma' },
    { pattern: /\btap\b/, category: ProcessCategory.TESTING, label: 'tap' },
    { pattern: /\bava\b/, category: ProcessCategory.TESTING, label: 'ava' },
    // ── INSTALLING ──────────────────────────────────────────────────────
    { pattern: /\bnpm\s+install\b/, category: ProcessCategory.INSTALLING, label: 'npm install' },
    { pattern: /\bpip\s+install\b/, category: ProcessCategory.INSTALLING, label: 'pip install' },
    { pattern: /\bapt-get\b/, category: ProcessCategory.INSTALLING, label: 'apt-get' },
    { pattern: /\bapt\b/, category: ProcessCategory.INSTALLING, label: 'apt' },
    { pattern: /\bbrew\b/, category: ProcessCategory.INSTALLING, label: 'brew' },
    { pattern: /\bcargo\s+install\b/, category: ProcessCategory.INSTALLING, label: 'cargo install' },
    { pattern: /\bgo\s+install\b/, category: ProcessCategory.INSTALLING, label: 'go install' },
    { pattern: /\bgem\s+install\b/, category: ProcessCategory.INSTALLING, label: 'gem install' },
    { pattern: /\bcomposer\b/, category: ProcessCategory.INSTALLING, label: 'composer' },
    { pattern: /\byarn\s+add\b/, category: ProcessCategory.INSTALLING, label: 'yarn add' },
    { pattern: /\bpnpm\s+install\b/, category: ProcessCategory.INSTALLING, label: 'pnpm install' },
    { pattern: /\bpacman\b/, category: ProcessCategory.INSTALLING, label: 'pacman' },
    { pattern: /\bdnf\b/, category: ProcessCategory.INSTALLING, label: 'dnf' },
    { pattern: /\byum\b/, category: ProcessCategory.INSTALLING, label: 'yum' },
    // ── RUNNING ─────────────────────────────────────────────────────────
    { pattern: /\bcargo\s+run\b/, category: ProcessCategory.RUNNING, label: 'cargo run' },
    { pattern: /\bgo\s+run\b/, category: ProcessCategory.RUNNING, label: 'go run' },
    { pattern: /\bdocker\s+run\b/, category: ProcessCategory.RUNNING, label: 'docker run' },
    { pattern: /\bbun\s+run\b/, category: ProcessCategory.RUNNING, label: 'bun run' },
    { pattern: /\bnode\b/, category: ProcessCategory.RUNNING, label: 'node' },
    { pattern: /\bpython[23]?\b/, category: ProcessCategory.RUNNING, label: 'python' },
    { pattern: /\bjava\b/, category: ProcessCategory.RUNNING, label: 'java' },
    { pattern: /\bruby\b/, category: ProcessCategory.RUNNING, label: 'ruby' },
    { pattern: /\bphp\b/, category: ProcessCategory.RUNNING, label: 'php' },
    { pattern: /\bflask\b/, category: ProcessCategory.RUNNING, label: 'flask' },
    { pattern: /\bdjango\b/, category: ProcessCategory.RUNNING, label: 'django' },
    { pattern: /\brails\b/, category: ProcessCategory.RUNNING, label: 'rails' },
    { pattern: /\buvicorn\b/, category: ProcessCategory.RUNNING, label: 'uvicorn' },
    { pattern: /\bgunicorn\b/, category: ProcessCategory.RUNNING, label: 'gunicorn' },
    { pattern: /\bnginx\b/, category: ProcessCategory.RUNNING, label: 'nginx' },
    { pattern: /\bapache\b/, category: ProcessCategory.RUNNING, label: 'apache' },
    { pattern: /\bdeno\b/, category: ProcessCategory.RUNNING, label: 'deno' },
    // ── IDLE (shell with no child process) ──────────────────────────────
    { pattern: /^-?(bash|zsh|sh|fish)$/, category: ProcessCategory.IDLE, label: 'shell' },
];
export class ProcessTracker {
    categorizeProcess(command, _paneContent) {
        const trimmed = command.trim();
        for (const rule of PATTERN_RULES) {
            if (rule.pattern.test(trimmed)) {
                return {
                    category: rule.category,
                    description: rule.label,
                };
            }
        }
        // Unknown command defaults to RUNNING if non-empty, IDLE otherwise
        if (trimmed.length === 0) {
            return { category: ProcessCategory.IDLE, description: 'idle' };
        }
        return { category: ProcessCategory.RUNNING, description: trimmed };
    }
    getProcessDescription(command) {
        const trimmed = command.trim();
        for (const rule of PATTERN_RULES) {
            if (rule.pattern.test(trimmed)) {
                return rule.label;
            }
        }
        return trimmed || 'idle';
    }
    enrichPane(pane) {
        const { category, description } = this.categorizeProcess(pane.command, pane.capturedContent);
        return {
            ...pane,
            processCategory: category,
            processDescription: description,
        };
    }
}
//# sourceMappingURL=processTracker.js.map
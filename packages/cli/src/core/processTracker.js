"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessTracker = void 0;
const types_1 = require("./types");
const PATTERN_RULES = [
    // ── BUILDING ────────────────────────────────────────────────────────
    { pattern: /\bninja\b/, category: types_1.ProcessCategory.BUILDING, label: 'ninja' },
    { pattern: /\bbazel\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'bazel build' },
    { pattern: /\bcmake\b/, category: types_1.ProcessCategory.BUILDING, label: 'cmake' },
    { pattern: /\bmake\b/, category: types_1.ProcessCategory.BUILDING, label: 'make' },
    { pattern: /\bgcc\b/, category: types_1.ProcessCategory.BUILDING, label: 'gcc' },
    { pattern: /\bg\+\+\b/, category: types_1.ProcessCategory.BUILDING, label: 'g++' },
    { pattern: /\bclang\b/, category: types_1.ProcessCategory.BUILDING, label: 'clang' },
    { pattern: /\brustc\b/, category: types_1.ProcessCategory.BUILDING, label: 'rustc' },
    { pattern: /\bcargo\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'cargo build' },
    { pattern: /\bgo\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'go build' },
    { pattern: /\bjavac\b/, category: types_1.ProcessCategory.BUILDING, label: 'javac' },
    { pattern: /\bnpm\s+run\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'npm run build' },
    { pattern: /\bwebpack\b/, category: types_1.ProcessCategory.BUILDING, label: 'webpack' },
    { pattern: /\btsc\b/, category: types_1.ProcessCategory.BUILDING, label: 'tsc' },
    { pattern: /\bgradle\b(?!.*\btest\b)/, category: types_1.ProcessCategory.BUILDING, label: 'gradle' },
    { pattern: /\bmvn\s+compile\b/, category: types_1.ProcessCategory.BUILDING, label: 'mvn compile' },
    { pattern: /\bvite\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'vite build' },
    { pattern: /\besbuild\b/, category: types_1.ProcessCategory.BUILDING, label: 'esbuild' },
    { pattern: /\brollup\b/, category: types_1.ProcessCategory.BUILDING, label: 'rollup' },
    { pattern: /\bturbo\s+build\b/, category: types_1.ProcessCategory.BUILDING, label: 'turbo build' },
    // ── TESTING ─────────────────────────────────────────────────────────
    { pattern: /\bpytest\b/, category: types_1.ProcessCategory.TESTING, label: 'pytest' },
    { pattern: /\bjest\b/, category: types_1.ProcessCategory.TESTING, label: 'jest' },
    { pattern: /\bmocha\b/, category: types_1.ProcessCategory.TESTING, label: 'mocha' },
    { pattern: /\bcargo\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'cargo test' },
    { pattern: /\bgo\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'go test' },
    { pattern: /\bnpm\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'npm test' },
    { pattern: /\bnpx\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'npx test' },
    { pattern: /\bvitest\b/, category: types_1.ProcessCategory.TESTING, label: 'vitest' },
    { pattern: /\bplaywright\b/, category: types_1.ProcessCategory.TESTING, label: 'playwright' },
    { pattern: /\bcypress\b/, category: types_1.ProcessCategory.TESTING, label: 'cypress' },
    { pattern: /\brspec\b/, category: types_1.ProcessCategory.TESTING, label: 'rspec' },
    { pattern: /\bphpunit\b/, category: types_1.ProcessCategory.TESTING, label: 'phpunit' },
    { pattern: /\bjunit\b/, category: types_1.ProcessCategory.TESTING, label: 'junit' },
    { pattern: /\bgradle\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'gradle test' },
    { pattern: /\bmvn\s+test\b/, category: types_1.ProcessCategory.TESTING, label: 'mvn test' },
    { pattern: /\bkarma\b/, category: types_1.ProcessCategory.TESTING, label: 'karma' },
    { pattern: /\btap\b/, category: types_1.ProcessCategory.TESTING, label: 'tap' },
    { pattern: /\bava\b/, category: types_1.ProcessCategory.TESTING, label: 'ava' },
    // ── INSTALLING ──────────────────────────────────────────────────────
    { pattern: /\bnpm\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'npm install' },
    { pattern: /\bpip\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'pip install' },
    { pattern: /\bapt-get\b/, category: types_1.ProcessCategory.INSTALLING, label: 'apt-get' },
    { pattern: /\bapt\b/, category: types_1.ProcessCategory.INSTALLING, label: 'apt' },
    { pattern: /\bbrew\b/, category: types_1.ProcessCategory.INSTALLING, label: 'brew' },
    { pattern: /\bcargo\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'cargo install' },
    { pattern: /\bgo\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'go install' },
    { pattern: /\bgem\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'gem install' },
    { pattern: /\bcomposer\b/, category: types_1.ProcessCategory.INSTALLING, label: 'composer' },
    { pattern: /\byarn\s+add\b/, category: types_1.ProcessCategory.INSTALLING, label: 'yarn add' },
    { pattern: /\bpnpm\s+install\b/, category: types_1.ProcessCategory.INSTALLING, label: 'pnpm install' },
    { pattern: /\bpacman\b/, category: types_1.ProcessCategory.INSTALLING, label: 'pacman' },
    { pattern: /\bdnf\b/, category: types_1.ProcessCategory.INSTALLING, label: 'dnf' },
    { pattern: /\byum\b/, category: types_1.ProcessCategory.INSTALLING, label: 'yum' },
    // ── RUNNING ─────────────────────────────────────────────────────────
    { pattern: /\bcargo\s+run\b/, category: types_1.ProcessCategory.RUNNING, label: 'cargo run' },
    { pattern: /\bgo\s+run\b/, category: types_1.ProcessCategory.RUNNING, label: 'go run' },
    { pattern: /\bdocker\s+run\b/, category: types_1.ProcessCategory.RUNNING, label: 'docker run' },
    { pattern: /\bbun\s+run\b/, category: types_1.ProcessCategory.RUNNING, label: 'bun run' },
    { pattern: /\bnode\b/, category: types_1.ProcessCategory.RUNNING, label: 'node' },
    { pattern: /\bpython[23]?\b/, category: types_1.ProcessCategory.RUNNING, label: 'python' },
    { pattern: /\bjava\b/, category: types_1.ProcessCategory.RUNNING, label: 'java' },
    { pattern: /\bruby\b/, category: types_1.ProcessCategory.RUNNING, label: 'ruby' },
    { pattern: /\bphp\b/, category: types_1.ProcessCategory.RUNNING, label: 'php' },
    { pattern: /\bflask\b/, category: types_1.ProcessCategory.RUNNING, label: 'flask' },
    { pattern: /\bdjango\b/, category: types_1.ProcessCategory.RUNNING, label: 'django' },
    { pattern: /\brails\b/, category: types_1.ProcessCategory.RUNNING, label: 'rails' },
    { pattern: /\buvicorn\b/, category: types_1.ProcessCategory.RUNNING, label: 'uvicorn' },
    { pattern: /\bgunicorn\b/, category: types_1.ProcessCategory.RUNNING, label: 'gunicorn' },
    { pattern: /\bnginx\b/, category: types_1.ProcessCategory.RUNNING, label: 'nginx' },
    { pattern: /\bapache\b/, category: types_1.ProcessCategory.RUNNING, label: 'apache' },
    { pattern: /\bdeno\b/, category: types_1.ProcessCategory.RUNNING, label: 'deno' },
    // ── IDLE (shell with no child process) ──────────────────────────────
    { pattern: /^-?(bash|zsh|sh|fish)$/, category: types_1.ProcessCategory.IDLE, label: 'shell' },
];
class ProcessTracker {
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
            return { category: types_1.ProcessCategory.IDLE, description: 'idle' };
        }
        return { category: types_1.ProcessCategory.RUNNING, description: trimmed };
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
exports.ProcessTracker = ProcessTracker;
//# sourceMappingURL=processTracker.js.map
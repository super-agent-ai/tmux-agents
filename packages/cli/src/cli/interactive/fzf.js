"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fzfPicker = fzfPicker;
exports.agentPicker = agentPicker;
exports.taskPicker = taskPicker;
const child_process_1 = require("child_process");
const output_1 = require("../util/output");
async function fzfPicker(items, preview) {
    return new Promise((resolve, reject) => {
        const args = ['--ansi', '--height=40%', '--border'];
        if (preview) {
            args.push(`--preview=${preview}`);
        }
        const fzf = (0, child_process_1.spawn)('fzf', args, {
            stdio: ['pipe', 'pipe', 'inherit']
        });
        fzf.stdin.write(items.join('\n'));
        fzf.stdin.end();
        let selected = '';
        fzf.stdout.on('data', (data) => {
            selected += data.toString();
        });
        fzf.on('close', (code) => {
            if (code === 0) {
                resolve(selected.trim() || null);
            }
            else if (code === 130) {
                // User cancelled (Ctrl+C)
                resolve(null);
            }
            else {
                reject(new Error('fzf failed'));
            }
        });
        fzf.on('error', (err) => {
            if (err.code === 'ENOENT') {
                (0, output_1.error)('fzf not found. Please install fzf: https://github.com/junegunn/fzf');
            }
            else {
                reject(err);
            }
        });
    });
}
async function agentPicker(agents) {
    const lines = agents.map(a => `${a.id.substring(0, 10)}  ${a.role.padEnd(12)}  ${a.status.padEnd(10)}  ${a.task || ''}`);
    const selected = await fzfPicker(lines, 'tmux-agents agent output {1} -n 30');
    if (!selected)
        return null;
    // Extract ID from first column
    const id = selected.split(/\s+/)[0];
    return id;
}
async function taskPicker(tasks) {
    const lines = tasks.map(t => `${t.id.substring(0, 10)}  ${t.column.padEnd(12)}  ${t.description}`);
    const selected = await fzfPicker(lines, 'tmux-agents task show {1}');
    if (!selected)
        return null;
    // Extract ID from first column
    const id = selected.split(/\s+/)[0];
    return id;
}
//# sourceMappingURL=fzf.js.map
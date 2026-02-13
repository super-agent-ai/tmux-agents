import { spawn } from 'child_process';
import { error } from '../util/output';

export async function fzfPicker(items: string[], preview?: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        const args = ['--ansi', '--height=40%', '--border'];

        if (preview) {
            args.push(`--preview=${preview}`);
        }

        const fzf = spawn('fzf', args, {
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
            } else if (code === 130) {
                // User cancelled (Ctrl+C)
                resolve(null);
            } else {
                reject(new Error('fzf failed'));
            }
        });

        fzf.on('error', (err: any) => {
            if (err.code === 'ENOENT') {
                error('fzf not found. Please install fzf: https://github.com/junegunn/fzf');
            } else {
                reject(err);
            }
        });
    });
}

export async function agentPicker(agents: any[]): Promise<string | null> {
    const lines = agents.map(a =>
        `${a.id.substring(0, 10)}  ${a.role.padEnd(12)}  ${a.status.padEnd(10)}  ${a.task || ''}`
    );

    const selected = await fzfPicker(lines, 'tmux-agents agent output {1} -n 30');

    if (!selected) return null;

    // Extract ID from first column
    const id = selected.split(/\s+/)[0];
    return id;
}

export async function taskPicker(tasks: any[]): Promise<string | null> {
    const lines = tasks.map(t =>
        `${t.id.substring(0, 10)}  ${t.column.padEnd(12)}  ${t.description}`
    );

    const selected = await fzfPicker(lines, 'tmux-agents task show {1}');

    if (!selected) return null;

    // Extract ID from first column
    const id = selected.split(/\s+/)[0];
    return id;
}

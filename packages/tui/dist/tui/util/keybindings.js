// ─── Keyboard Bindings ──────────────────────────────────────────────────────
import { execSync } from 'child_process';
const POPUP_BINDINGS = [
    {
        key: 'C-a',
        description: 'Agent picker (fzf)',
        command: 'tmux-agents agent list | fzf',
    },
    {
        key: 'C-t',
        description: 'Task picker (fzf)',
        command: 'tmux-agents task list | fzf',
    },
];
/**
 * Sets up tmux key bindings for popups
 * These are global bindings that work from anywhere in the TUI session
 */
export function setupKeyBindings(_sessionName) {
    for (const binding of POPUP_BINDINGS) {
        try {
            // Bind key to display popup with command
            execSync(`tmux bind-key -T root ${binding.key} display-popup -E -w 80% -h 80% "${binding.command}"`, {
                encoding: 'utf-8',
            });
        }
        catch (error) {
            console.warn(`Failed to bind key ${binding.key}: ${error}`);
        }
    }
}
/**
 * Opens a tmux popup with a command
 */
export function openPopup(command, width = '80%', height = '80%') {
    try {
        execSync(`tmux display-popup -E -w ${width} -h ${height} "${command}"`, {
            encoding: 'utf-8',
        });
    }
    catch (error) {
        console.error(`Failed to open popup: ${error}`);
    }
}
/**
 * Opens a popup for sending a prompt to an agent
 */
export function openSendPromptPopup(agentId) {
    const command = `tmux-agents agent send ${agentId}`;
    openPopup(command, '80%', '40%');
}
/**
 * Opens a popup for spawning a new agent
 */
export function openSpawnAgentPopup() {
    const command = 'tmux-agents agent spawn';
    openPopup(command, '80%', '60%');
}
/**
 * Opens a popup for submitting a new task
 */
export function openSubmitTaskPopup() {
    const command = 'tmux-agents task create';
    openPopup(command, '80%', '60%');
}
/**
 * Opens a popup for agent picker
 */
export function openAgentPicker() {
    const command = 'tmux-agents agent list --format json | jq -r ".[] | \\(.id): \\(.role) [\\(.status)]" | fzf --preview "tmux-agents agent info {1}"';
    openPopup(command);
}
/**
 * Opens a popup for task picker
 */
export function openTaskPicker() {
    const command = 'tmux-agents task list --format json | jq -r ".[] | \\(.id): \\(.title) [\\(.status)]" | fzf --preview "tmux-agents task info {1}"';
    openPopup(command);
}
//# sourceMappingURL=keybindings.js.map
// ─── TUI Launcher ───────────────────────────────────────────────────────────
import { hasTmux, createTUISession, attachToTUISession, killTUISession, } from './util/tmuxLayout.js';
import { setupKeyBindings } from './util/keybindings.js';
/**
 * Launches the TUI in the appropriate mode
 * - If tmux is available: creates a tmux session with split panes
 * - Otherwise: launches pure Ink TUI (fallback mode)
 */
export async function launchTUI(socketPath) {
    if (hasTmux()) {
        console.log('Launching TUI with tmux hybrid mode...');
        await launchTmuxHybridTUI(socketPath);
    }
    else {
        console.log('tmux not available, launching pure Ink mode...');
        await launchPureInkTUI(socketPath);
    }
}
/**
 * Launches the TUI in a tmux session with split panes
 * Best experience: dashboard + preview pane + status bar
 */
async function launchTmuxHybridTUI(socketPath) {
    try {
        // Clean up any existing session
        killTUISession();
        // Build the dashboard command
        const nodeExec = process.execPath;
        const dashboardScript = new URL('./index.js', import.meta.url).pathname;
        const socketArg = socketPath ? ` --socket ${socketPath}` : '';
        const dashboardCommand = `${nodeExec} ${dashboardScript}${socketArg}`;
        // Create tmux session with layout
        const panes = createTUISession(dashboardCommand);
        console.log(`Created TUI session with ${panes.length} panes`);
        // Set up key bindings
        setupKeyBindings('tmux-agents-tui');
        // Attach to the session (this blocks until user exits)
        attachToTUISession();
    }
    catch (error) {
        console.error('Failed to launch tmux hybrid TUI:', error);
        process.exit(1);
    }
}
/**
 * Launches the TUI in pure Ink mode (no tmux)
 * Fallback mode with embedded output instead of preview pane
 */
async function launchPureInkTUI(socketPath) {
    try {
        // In pure Ink mode, we just run the React app directly
        const { render } = await import('ink');
        const React = await import('react');
        const { App } = await import('./components/App.js');
        render(React.createElement(App, { socketPath }));
    }
    catch (error) {
        console.error('Failed to launch pure Ink TUI:', error);
        process.exit(1);
    }
}
/**
 * Cleanup function to kill the TUI session
 */
export function cleanupTUI() {
    if (hasTmux()) {
        try {
            killTUISession();
            console.log('TUI session cleaned up');
        }
        catch (error) {
            console.warn('Failed to cleanup TUI session:', error);
        }
    }
}
//# sourceMappingURL=launcher.js.map
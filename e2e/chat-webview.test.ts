import { browser, expect } from '@wdio/globals';

describe('Tmux Agents Extension E2E', () => {
  it('VS Code loads with the extension', async () => {
    // Wait for VS Code workbench to appear (try multiple selectors for compatibility)
    const workbenchSelector = '.monaco-workbench, #workbench\\.parts\\.editor, .parts-splash';
    await browser.waitUntil(
      async () => {
        const el = await browser.$(workbenchSelector);
        return el.isExisting();
      },
      { timeout: 30000, timeoutMsg: 'VS Code workbench not found within 30s' }
    );
    const title = await browser.getTitle();
    expect(title).toBeDefined();
  });

  it('extension commands are available', async () => {
    const commands: string[] = await (browser as any).executeWorkbench(
      async (vscode: any) => {
        return vscode.commands.getCommands(true);
      }
    );
    expect(commands).toContain('tmux-agents.attach');
    expect(commands).toContain('tmux-agents.refresh');
    expect(commands).toContain('tmux-agents.new');
  });

  it('extension activates and registers all 43 commands', async () => {
    const commands: string[] = await (browser as any).executeWorkbench(
      async (vscode: any) => {
        const ext = vscode.extensions.getExtension('super-agent.tmux-agents');
        if (ext && !ext.isActive) {
          await ext.activate();
        }
        return vscode.commands.getCommands(true);
      }
    );
    const tmuxCommands = commands.filter(
      (c: string) => c.startsWith('tmux-agents.')  || c.startsWith('tmux-agents-')
    );
    expect(tmuxCommands.length).toBeGreaterThanOrEqual(43);
  });
});

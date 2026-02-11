describe('Tmux Agents Extension E2E', () => {
  it('VS Code loads with the extension', async () => {
    const workbench = await browser.getWorkbench();
    const title = await workbench.getTitleBar().getTitle();
    expect(title).toContain('Extension Development Host');
  });

  it('Tmux Agents sidebar exists', async () => {
    const workbench = await browser.getWorkbench();
    const activityBar = workbench.getActivityBar();
    const viewControls = await activityBar.getViewControls();
    const titles = await Promise.all(
      viewControls.map((vc) => vc.getTitle())
    );
    const hasTmuxView = titles.some(
      (t) => t.includes('Tmux') || t.includes('tmux-agents')
    );
    expect(hasTmuxView).toBe(true);
  });

  it('extension commands are available', async () => {
    const commands: string[] = await browser.executeWorkbench(
      async (vscode) => {
        return vscode.commands.getCommands(true);
      }
    );
    expect(commands).toContain('tmux-agents.attach');
    expect(commands).toContain('tmux-agents.refresh');
    expect(commands).toContain('tmux-agents.new');
  });
});

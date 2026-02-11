import * as vscode from 'vscode';
import * as assert from 'assert';

suite('Extension Integration Tests', () => {
  test('Extension activates without error', async () => {
    const extension = vscode.extensions.getExtension('super-agent.tmux-agents');
    assert.ok(extension, 'Extension should be found');

    await extension.activate();
    assert.strictEqual(extension.isActive, true, 'Extension should be active after activation');
  });

  test('Key commands are registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'tmux-agents.refresh',
      'tmux-agents.newSession',
      'tmux-agents.openKanban',
      'tmux-agents.openDashboard',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        commands.includes(cmd),
        `Command '${cmd}' should be registered`
      );
    }
  });
});

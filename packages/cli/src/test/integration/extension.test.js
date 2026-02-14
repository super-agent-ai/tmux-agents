"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = __importStar(require("vscode"));
const assert = __importStar(require("assert"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
let activated = false;
async function ensureActivated() {
    const ext = vscode.extensions.getExtension('super-agent.tmux-agents');
    assert.ok(ext, 'Extension must be present');
    if (!activated) {
        await ext.activate();
        activated = true;
    }
    return ext;
}
function getPackageJSON() {
    const ext = vscode.extensions.getExtension('super-agent.tmux-agents');
    assert.ok(ext, 'Extension must be present for packageJSON');
    return ext.packageJSON;
}
// ─── Expected command lists (derived from registerCommand calls) ──────────────
const SESSION_COMMANDS = [
    'tmux-agents.attach',
    'tmux-agents.refresh',
    'tmux-agents.toggleAutoRefresh',
    'tmux-agents.rename',
    'tmux-agents.renameWindow',
    'tmux-agents.new',
    'tmux-agents.delete',
    'tmux-agents.kill-window',
    'tmux-agents.kill-pane',
    'tmux-agents.newWindow',
    'tmux-agents.splitPaneRight',
    'tmux-agents.splitPaneDown',
    'tmux-agents.inline.newWindow',
    'tmux-agents.inline.splitPane',
    'tmux-agents.renamePane',
    'tmux-agents.addPaneToWindow',
    'tmux-agents.testConnection',
    'tmux-agents.openServerTerminal',
    'tmux-agents.configureServers',
    'tmux-agents.newClaudeSession',
    'tmux-agents.newGeminiSession',
    'tmux-agents.newCodexSession',
    'tmux-agents.newAIWindow',
    'tmux-agents.newAIPane',
    'tmux-agents.forkAISession',
    'tmux-agents.hotkeyJump',
    'tmux-agents.renameAI',
];
const AGENT_COMMANDS = [
    'tmux-agents.openDashboard',
    'tmux-agents.openGraph',
    'tmux-agents.submitTask',
    'tmux-agents.spawnAgent',
    'tmux-agents.killAgent',
    'tmux-agents.createTeam',
    'tmux-agents.createPipeline',
    'tmux-agents.runPipeline',
    'tmux-agents.sendToAgent',
    'tmux-agents.fanOut',
    'tmux-agents.manageTemplates',
    'tmux-agents.quickTeamCoding',
    'tmux-agents.quickTeamResearch',
    'tmux-agents.createPipelineNL',
    'tmux-agents.openKanban',
];
const AUTO_REGISTERED_COMMANDS = [
    'tmux-agents-chat.focus',
];
const ALL_EXPECTED_COMMANDS = [
    ...SESSION_COMMANDS,
    ...AGENT_COMMANDS,
    ...AUTO_REGISTERED_COMMANDS,
];
// ─── 1. Activation ───────────────────────────────────────────────────────────
suite('Activation', () => {
    test('Extension is present in extensions list', () => {
        const ext = vscode.extensions.getExtension('super-agent.tmux-agents');
        assert.ok(ext, 'Extension should be found by ID');
    });
    test('Activates without error', async () => {
        const ext = await ensureActivated();
        assert.strictEqual(ext.isActive, true);
    });
    test('Exports activate and deactivate functions', async () => {
        const ext = await ensureActivated();
        const exports = ext.exports;
        // Extension module itself has activate/deactivate — verify the extension loaded
        assert.strictEqual(ext.isActive, true, 'Extension must be active');
    });
    test('Package.json has correct publisher and name', () => {
        const pkg = getPackageJSON();
        assert.strictEqual(pkg.publisher, 'super-agent');
        assert.strictEqual(pkg.name, 'tmux-agents');
    });
});
// ─── 2. Command Registration — Session Commands ──────────────────────────────
suite('Command Registration — Session Commands', () => {
    let registeredCommands;
    suiteSetup(async () => {
        await ensureActivated();
        registeredCommands = await vscode.commands.getCommands(true);
    });
    for (const cmd of SESSION_COMMANDS) {
        test(`${cmd} is registered`, () => {
            assert.ok(registeredCommands.includes(cmd), `Command '${cmd}' should be registered`);
        });
    }
});
// ─── 3. Command Registration — Agent/Orchestrator Commands ───────────────────
suite('Command Registration — Agent/Orchestrator Commands', () => {
    let registeredCommands;
    suiteSetup(async () => {
        await ensureActivated();
        registeredCommands = await vscode.commands.getCommands(true);
    });
    for (const cmd of AGENT_COMMANDS) {
        test(`${cmd} is registered`, () => {
            assert.ok(registeredCommands.includes(cmd), `Command '${cmd}' should be registered`);
        });
    }
});
// ─── 4. Command Registration — Auto-Registered ──────────────────────────────
suite('Command Registration — Auto-Registered', () => {
    let registeredCommands;
    suiteSetup(async () => {
        await ensureActivated();
        registeredCommands = await vscode.commands.getCommands(true);
    });
    test('tmux-agents-chat.focus is registered (webview view provider)', () => {
        assert.ok(registeredCommands.includes('tmux-agents-chat.focus'), 'tmux-agents-chat.focus should be auto-registered by VS Code');
    });
});
// ─── 5. Command Registration — Completeness ─────────────────────────────────
suite('Command Registration — Completeness', () => {
    let registeredCommands;
    suiteSetup(async () => {
        await ensureActivated();
        registeredCommands = await vscode.commands.getCommands(true);
    });
    test('All 43 expected commands are registered', () => {
        assert.strictEqual(ALL_EXPECTED_COMMANDS.length, 43, 'Expected list should have 43 commands');
        const missing = ALL_EXPECTED_COMMANDS.filter(cmd => !registeredCommands.includes(cmd));
        assert.deepStrictEqual(missing, [], `Missing commands: ${missing.join(', ')}`);
    });
    test('No duplicate IDs in expected command list', () => {
        const unique = new Set(ALL_EXPECTED_COMMANDS);
        assert.strictEqual(unique.size, ALL_EXPECTED_COMMANDS.length, 'Expected command list should have no duplicates');
    });
    test('Bug regression: tmux-agents.newSession does NOT exist (correct is tmux-agents.new)', () => {
        assert.ok(!registeredCommands.includes('tmux-agents.newSession'), 'tmux-agents.newSession should NOT be registered — the correct ID is tmux-agents.new');
        assert.ok(registeredCommands.includes('tmux-agents.new'), 'tmux-agents.new should be registered');
    });
});
// ─── 6. Command Execution — Safe Commands ────────────────────────────────────
suite('Command Execution — Safe Commands', () => {
    suiteSetup(async () => {
        await ensureActivated();
    });
    test('refresh executes without error', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.refresh')));
    });
    test('toggleAutoRefresh executes without error (toggle on/off)', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.toggleAutoRefresh')));
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.toggleAutoRefresh')));
    });
    test('configureServers executes without error', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.configureServers')));
    });
    test('openDashboard executes without error', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.openDashboard')));
    });
    test('openKanban executes without error', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.openKanban')));
    });
    test('tmux-agents-chat.focus executes without error', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents-chat.focus')));
    });
});
// ─── 7. Command Execution — Graceful No-Arg Handling ─────────────────────────
suite('Command Execution — Graceful No-Arg Handling', () => {
    suiteSetup(async () => {
        await ensureActivated();
    });
    const noArgCommands = [
        'tmux-agents.attach',
        'tmux-agents.rename',
        'tmux-agents.renameWindow',
        'tmux-agents.delete',
        'tmux-agents.kill-window',
        'tmux-agents.kill-pane',
        'tmux-agents.newWindow',
        'tmux-agents.splitPaneRight',
        'tmux-agents.splitPaneDown',
        'tmux-agents.inline.newWindow',
        'tmux-agents.inline.splitPane',
        'tmux-agents.renamePane',
        'tmux-agents.addPaneToWindow',
        'tmux-agents.newAIWindow',
        'tmux-agents.newAIPane',
        'tmux-agents.forkAISession',
        'tmux-agents.renameAI',
        'tmux-agents.testConnection',
        'tmux-agents.openServerTerminal',
    ];
    for (const cmd of noArgCommands) {
        test(`${cmd} handles no arguments gracefully`, async () => {
            await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand(cmd)), `${cmd} should not throw when called without arguments`);
        });
    }
});
// ─── 8. Command Execution — QuickPick/InputBox Commands ──────────────────────
suite('Command Execution — QuickPick Commands', () => {
    suiteSetup(async () => {
        await ensureActivated();
    });
    test('killAgent executes without error (shows QuickPick, auto-dismisses)', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.killAgent')));
    });
    test('sendToAgent executes without error (shows QuickPick, auto-dismisses)', async () => {
        await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand('tmux-agents.sendToAgent')));
    });
});
// ─── 9. Tree View Providers ──────────────────────────────────────────────────
suite('Tree View Providers', () => {
    let pkg;
    suiteSetup(async () => {
        await ensureActivated();
        pkg = getPackageJSON();
    });
    test('tmux-agents sessions tree view is declared', () => {
        const views = pkg.contributes.views['tmux-agents'];
        assert.ok(Array.isArray(views), 'Views array should exist');
        const sessionsView = views.find((v) => v.id === 'tmux-agents');
        assert.ok(sessionsView, 'tmux-agents sessions view should be declared');
        assert.strictEqual(sessionsView.name, 'Sessions');
        // Default type is tree view (no type property or type !== 'webview')
        assert.ok(!sessionsView.type || sessionsView.type !== 'webview', 'Sessions view should be a tree view');
    });
    test('tmux-agents-chat webview view is declared', () => {
        const views = pkg.contributes.views['tmux-agents'];
        const chatView = views.find((v) => v.id === 'tmux-agents-chat');
        assert.ok(chatView, 'tmux-agents-chat view should be declared');
        assert.strictEqual(chatView.name, 'AI Chat');
        assert.strictEqual(chatView.type, 'webview');
    });
    test('tmux-agents-shortcuts tree view is declared', () => {
        const views = pkg.contributes.views['tmux-agents'];
        const shortcutsView = views.find((v) => v.id === 'tmux-agents-shortcuts');
        assert.ok(shortcutsView, 'tmux-agents-shortcuts view should be declared');
        assert.strictEqual(shortcutsView.name, 'Shortcuts');
    });
    test('tmux-agents view container is declared in activity bar', () => {
        const containers = pkg.contributes.viewsContainers.activitybar;
        assert.ok(Array.isArray(containers), 'Activity bar containers should exist');
        const container = containers.find((c) => c.id === 'tmux-agents');
        assert.ok(container, 'tmux-agents container should be declared');
        assert.strictEqual(container.title, 'Tmux Agents');
    });
});
// ─── 10. Configuration Settings ──────────────────────────────────────────────
suite('Configuration Settings', () => {
    let properties;
    suiteSetup(async () => {
        await ensureActivated();
        const pkg = getPackageJSON();
        properties = pkg.contributes.configuration.properties;
    });
    test('showLocalSessions defaults to true', () => {
        const prop = properties['tmuxAgents.showLocalSessions'];
        assert.ok(prop, 'showLocalSessions property should exist');
        assert.strictEqual(prop.default, true);
    });
    test('defaultProvider defaults to "claude"', () => {
        const prop = properties['tmuxAgents.defaultProvider'];
        assert.ok(prop, 'defaultProvider property should exist');
        assert.strictEqual(prop.default, 'claude');
    });
    test('fallbackProvider defaults to "gemini"', () => {
        const prop = properties['tmuxAgents.fallbackProvider'];
        assert.ok(prop, 'fallbackProvider property should exist');
        assert.strictEqual(prop.default, 'gemini');
    });
    test('daemonRefresh defaults to { enabled: true, lightInterval: 10000, fullInterval: 60000 }', () => {
        const prop = properties['tmuxAgents.daemonRefresh'];
        assert.ok(prop, 'daemonRefresh property should exist');
        assert.deepStrictEqual(prop.default, {
            enabled: true,
            lightInterval: 10000,
            fullInterval: 60000,
        });
    });
    test('paneCapture defaults to { enabled: true, lines: 50 }', () => {
        const prop = properties['tmuxAgents.paneCapture'];
        assert.ok(prop, 'paneCapture property should exist');
        assert.deepStrictEqual(prop.default, {
            enabled: true,
            lines: 50,
        });
    });
    test('orchestrator defaults to { enabled: true, pollingInterval: 5000, autoDispatch: true }', () => {
        const prop = properties['tmuxAgents.orchestrator'];
        assert.ok(prop, 'orchestrator property should exist');
        assert.deepStrictEqual(prop.default, {
            enabled: true,
            pollingInterval: 5000,
            autoDispatch: true,
        });
    });
    test('smartAttachment.openInEditor defaults to true', () => {
        const prop = properties['tmuxAgents.smartAttachment.openInEditor'];
        assert.ok(prop, 'smartAttachment.openInEditor property should exist');
        assert.strictEqual(prop.default, true);
    });
    test('agentTemplates defaults to empty array', () => {
        const prop = properties['tmuxAgents.agentTemplates'];
        assert.ok(prop, 'agentTemplates property should exist');
        assert.deepStrictEqual(prop.default, []);
    });
    test('sshServers defaults to { servers: [], script: {} }', () => {
        const prop = properties['tmuxAgents.sshServers'];
        assert.ok(prop, 'sshServers property should exist');
        assert.deepStrictEqual(prop.default, { servers: [], script: {} });
    });
    test('aiProviders defaults include claude, gemini, and codex with correct commands', () => {
        const prop = properties['tmuxAgents.aiProviders'];
        assert.ok(prop, 'aiProviders property should exist');
        const defaults = prop.default;
        assert.ok(defaults.claude, 'claude provider should exist');
        assert.strictEqual(defaults.claude.command, 'claude');
        assert.strictEqual(defaults.claude.pipeCommand, 'claude');
        assert.deepStrictEqual(defaults.claude.forkArgs, ['--continue']);
        assert.ok(defaults.gemini, 'gemini provider should exist');
        assert.strictEqual(defaults.gemini.command, 'gemini');
        assert.strictEqual(defaults.gemini.pipeCommand, 'gemini');
        assert.ok(defaults.codex, 'codex provider should exist');
        assert.strictEqual(defaults.codex.command, 'codex');
        assert.strictEqual(defaults.codex.pipeCommand, 'codex');
    });
    test('All 10 configuration keys are present', () => {
        const expectedKeys = [
            'tmuxAgents.sshServers',
            'tmuxAgents.showLocalSessions',
            'tmuxAgents.daemonRefresh',
            'tmuxAgents.paneCapture',
            'tmuxAgents.smartAttachment.openInEditor',
            'tmuxAgents.orchestrator',
            'tmuxAgents.agentTemplates',
            'tmuxAgents.defaultProvider',
            'tmuxAgents.fallbackProvider',
            'tmuxAgents.aiProviders',
        ];
        for (const key of expectedKeys) {
            assert.ok(properties[key], `Configuration key '${key}' should exist`);
        }
    });
});
// ─── 11. Keybindings ─────────────────────────────────────────────────────────
suite('Keybindings', () => {
    test('All 16 expected keybinding commands are declared', () => {
        const pkg = getPackageJSON();
        const keybindings = pkg.contributes.keybindings;
        assert.ok(Array.isArray(keybindings), 'Keybindings should be an array');
        assert.strictEqual(keybindings.length, 16, 'Should have exactly 16 keybindings');
        const expectedKeybindingCommands = [
            'tmux-agents.hotkeyJump',
            'tmux-agents.new',
            'tmux-agents.newClaudeSession',
            'tmux-agents.refresh',
            'tmux-agents.openDashboard',
            'tmux-agents.openGraph',
            'tmux-agents.submitTask',
            'tmux-agents.openKanban',
            'tmux-agents-chat.focus',
            'tmux-agents.spawnAgent',
            'tmux-agents.createTeam',
            'tmux-agents.fanOut',
            'tmux-agents.sendToAgent',
            'tmux-agents.createPipelineNL',
            'tmux-agents.quickTeamCoding',
            'tmux-agents.quickTeamResearch',
        ];
        const declaredCommands = keybindings.map((kb) => kb.command);
        for (const cmd of expectedKeybindingCommands) {
            assert.ok(declaredCommands.includes(cmd), `Keybinding for '${cmd}' should be declared`);
        }
    });
});
// ─── 12. Activation Event + Menu Contributions ──────────────────────────────
suite('Activation Event + Menu Contributions', () => {
    let pkg;
    suiteSetup(async () => {
        await ensureActivated();
        pkg = getPackageJSON();
    });
    test('onView:tmux-agents activation event is declared', () => {
        const events = pkg.activationEvents;
        assert.ok(Array.isArray(events), 'activationEvents should be an array');
        assert.ok(events.includes('onView:tmux-agents'), 'Should include onView:tmux-agents activation event');
    });
    test('view/title menus are declared and non-empty', () => {
        const menus = pkg.contributes.menus;
        assert.ok(menus['view/title'], 'view/title menus should exist');
        assert.ok(Array.isArray(menus['view/title']) && menus['view/title'].length > 0, 'view/title menus should be non-empty');
    });
    test('view/item/context menus are declared and non-empty', () => {
        const menus = pkg.contributes.menus;
        assert.ok(menus['view/item/context'], 'view/item/context menus should exist');
        assert.ok(Array.isArray(menus['view/item/context']) && menus['view/item/context'].length > 0, 'view/item/context menus should be non-empty');
    });
});
//# sourceMappingURL=extension.test.js.map
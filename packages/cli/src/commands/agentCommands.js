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
exports.registerAgentCommands = registerAgentCommands;
const vscode = __importStar(require("vscode"));
const types_1 = require("../core/types");
async function spawnAgentFromTemplate(template, ctx, teamId) {
    const service = await ctx.pickService();
    if (!service) {
        return undefined;
    }
    const sessions = await service.getSessions();
    const baseName = `agent-${template.role}-${template.aiProvider}`;
    let name = baseName;
    let counter = 0;
    while (sessions.includes(name)) {
        counter++;
        name = `${baseName}-${counter}`;
    }
    try {
        await service.newSession(name);
        const launchCmd = ctx.aiManager.getLaunchCommand(template.aiProvider);
        await service.sendKeysToSession(name, launchCmd);
        const freshSessions = await service.getTmuxTreeFresh();
        const session = freshSessions.find(s => s.name === name);
        const windowIndex = session?.windows[0]?.index || '0';
        const paneIndex = session?.windows[0]?.panes[0]?.index || '0';
        const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const agent = {
            id: agentId,
            templateId: template.id,
            name: name,
            role: template.role,
            aiProvider: template.aiProvider,
            state: types_1.AgentState.SPAWNING,
            serverId: service.serverId,
            sessionName: name,
            windowIndex,
            paneIndex,
            teamId,
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        ctx.orchestrator.registerAgent(agent);
        ctx.tmuxSessionProvider.refresh();
        ctx.updateDashboard();
        setTimeout(() => {
            ctx.orchestrator.updateAgentState(agentId, types_1.AgentState.IDLE);
        }, 3000);
        return agent;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to spawn agent: ${error}`);
        return undefined;
    }
}
function registerAgentCommands(context, ctx) {
    const disposables = [];
    disposables.push(vscode.commands.registerCommand('tmux-agents.openDashboard', () => {
        ctx.dashboardView.show();
        ctx.updateDashboard();
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.openGraph', async () => {
        const pipelines = ctx.pipelineEngine.getAllPipelines();
        if (pipelines.length === 0) {
            vscode.window.showInformationMessage('No pipelines defined. Create one first.');
            return;
        }
        const pick = await vscode.window.showQuickPick(pipelines.map(p => ({ label: p.name, description: p.description, pipeline: p })), { placeHolder: 'Select pipeline to view' });
        if (pick) {
            ctx.graphView.show();
            const activeRun = ctx.pipelineEngine.getActiveRuns().find(r => r.pipelineId === pick.pipeline.id);
            ctx.graphView.setPipeline(pick.pipeline, activeRun);
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.submitTask', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Describe the task (AI will route to the right agent)',
            placeHolder: 'e.g., "Review the auth module for security issues"'
        });
        if (!input) {
            return;
        }
        vscode.window.showInformationMessage('Routing task...');
        try {
            const task = await ctx.taskRouter.parseTaskFromNaturalLanguage(input);
            ctx.orchestrator.submitTask(task);
            vscode.window.showInformationMessage(`Task routed to ${task.targetRole} (priority ${task.priority})`);
            ctx.updateDashboard();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to route task: ${error}`);
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.spawnAgent', async () => {
        const templates = ctx.templateManager.getAllTemplates();
        const pick = await vscode.window.showQuickPick(templates.map(t => ({
            label: t.name,
            description: `${t.role} | ${t.aiProvider}`,
            detail: t.description,
            template: t
        })), { placeHolder: 'Select agent template' });
        if (!pick) {
            return;
        }
        await spawnAgentFromTemplate(pick.template, ctx);
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.killAgent', async () => {
        const agents = ctx.orchestrator.getAllAgents();
        if (agents.length === 0) {
            vscode.window.showInformationMessage('No active agents.');
            return;
        }
        const pick = await vscode.window.showQuickPick(agents.map(a => ({
            label: a.name,
            description: `${a.role} | ${a.state} | ${a.serverId}`,
            agent: a
        })), { placeHolder: 'Select agent to terminate' });
        if (!pick) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`Terminate agent "${pick.agent.name}"?`, { modal: true }, 'Terminate');
        if (confirm === 'Terminate') {
            ctx.orchestrator.removeAgent(pick.agent.id);
            const service = ctx.serviceManager.getService(pick.agent.serverId);
            if (service) {
                await service.deleteSession(pick.agent.sessionName);
            }
            ctx.tmuxSessionProvider.refresh();
            ctx.updateDashboard();
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.createTeam', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Team name',
            placeHolder: 'e.g., "feature-auth-team"'
        });
        if (!name) {
            return;
        }
        const templates = ctx.templateManager.getAllTemplates();
        const picks = await vscode.window.showQuickPick(templates.map(t => ({
            label: t.name,
            description: `${t.role} | ${t.aiProvider}`,
            template: t,
            picked: false
        })), { placeHolder: 'Select agent templates for this team (multi-select)', canPickMany: true });
        if (!picks || picks.length === 0) {
            return;
        }
        const team = ctx.teamManager.createTeam(name);
        vscode.window.showInformationMessage(`Creating team "${name}" with ${picks.length} agents...`);
        for (const pick of picks) {
            const agent = await spawnAgentFromTemplate(pick.template, ctx, team.id);
            if (agent) {
                ctx.teamManager.addAgentToTeam(team.id, agent.id);
            }
        }
        ctx.updateDashboard();
        vscode.window.showInformationMessage(`Team "${name}" created with ${picks.length} agents.`);
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.createPipeline', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Pipeline name',
            placeHolder: 'e.g., "My Development Pipeline"'
        });
        if (!name) {
            return;
        }
        const pipeline = ctx.pipelineEngine.createPipeline(name);
        ctx.graphView.show();
        ctx.graphView.setPipeline(pipeline);
        vscode.window.showInformationMessage(`Pipeline "${name}" created. Add stages in the graph view.`);
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.runPipeline', async () => {
        const pipelines = ctx.pipelineEngine.getAllPipelines();
        if (pipelines.length === 0) {
            vscode.window.showInformationMessage('No pipelines available.');
            return;
        }
        const pick = await vscode.window.showQuickPick(pipelines.map(p => ({
            label: p.name,
            description: `${p.stages.length} stages`,
            pipeline: p
        })), { placeHolder: 'Select pipeline to run' });
        if (!pick) {
            return;
        }
        const run = ctx.pipelineEngine.startRun(pick.pipeline.id);
        await ctx.advancePipeline(run.id);
        ctx.updateDashboard();
        vscode.window.showInformationMessage(`Pipeline "${pick.pipeline.name}" started.`);
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.sendToAgent', async () => {
        const agents = ctx.orchestrator.getAllAgents().filter(a => a.state !== types_1.AgentState.TERMINATED);
        if (agents.length === 0) {
            vscode.window.showInformationMessage('No active agents.');
            return;
        }
        const agentPick = await vscode.window.showQuickPick(agents.map(a => ({ label: a.name, description: `${a.role} | ${a.state}`, agent: a })), { placeHolder: 'Select agent' });
        if (!agentPick) {
            return;
        }
        const prompt = await vscode.window.showInputBox({
            prompt: `Send prompt to ${agentPick.agent.name}`,
            placeHolder: 'Enter your prompt...'
        });
        if (!prompt) {
            return;
        }
        try {
            await ctx.orchestrator.sendPromptToAgent(agentPick.agent.id, prompt);
            vscode.window.showInformationMessage(`Prompt sent to ${agentPick.agent.name}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to send prompt: ${error}`);
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.fanOut', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Task to fan out to multiple agents',
            placeHolder: 'e.g., "Solve this problem and compare approaches"'
        });
        if (!input) {
            return;
        }
        const countStr = await vscode.window.showInputBox({
            prompt: 'Number of parallel agents',
            value: '3',
            validateInput: v => /^\d+$/.test(v) && parseInt(v) > 0 && parseInt(v) <= 10 ? null : 'Enter 1-10'
        });
        if (!countStr) {
            return;
        }
        const count = parseInt(countStr);
        const templates = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.CODER);
        const template = templates[0];
        if (!template) {
            vscode.window.showErrorMessage('No coder templates available');
            return;
        }
        vscode.window.showInformationMessage(`Spawning ${count} agents for fan-out...`);
        for (let i = 0; i < count; i++) {
            const agent = await spawnAgentFromTemplate(template, ctx);
            if (agent) {
                setTimeout(() => {
                    ctx.orchestrator.sendPromptToAgent(agent.id, input).catch(console.error);
                }, 5000);
            }
        }
        ctx.updateDashboard();
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.manageTemplates', async () => {
        const action = await vscode.window.showQuickPick([
            { label: 'View Templates', description: 'List all available templates' },
            { label: 'Create Template', description: 'Create a new agent template' },
            { label: 'Delete Template', description: 'Remove a custom template' }
        ], { placeHolder: 'Template management' });
        if (!action) {
            return;
        }
        if (action.label === 'View Templates') {
            const templates = ctx.templateManager.getAllTemplates();
            const items = templates.map(t => ({
                label: `${ctx.templateManager.isBuiltIn(t.id) ? '[Built-in]' : '[Custom]'} ${t.name}`,
                description: `${t.role} | ${t.aiProvider}`,
                detail: t.description
            }));
            await vscode.window.showQuickPick(items, { placeHolder: 'Agent templates' });
        }
        else if (action.label === 'Create Template') {
            const name = await vscode.window.showInputBox({ prompt: 'Template name' });
            if (!name) {
                return;
            }
            const rolePick = await vscode.window.showQuickPick(Object.values(types_1.AgentRole).map(r => ({ label: r })), { placeHolder: 'Agent role' });
            if (!rolePick) {
                return;
            }
            const providerPick = await vscode.window.showQuickPick(Object.values(types_1.AIProvider).map(p => ({ label: p })), { placeHolder: 'AI provider' });
            if (!providerPick) {
                return;
            }
            ctx.templateManager.createTemplate({
                name,
                role: rolePick.label,
                aiProvider: providerPick.label,
                description: `Custom ${rolePick.label} agent with ${providerPick.label}`
            });
            await ctx.templateManager.saveToSettings();
            vscode.window.showInformationMessage(`Template "${name}" created.`);
        }
        else if (action.label === 'Delete Template') {
            const customTemplates = ctx.templateManager.getAllTemplates().filter(t => !ctx.templateManager.isBuiltIn(t.id));
            if (customTemplates.length === 0) {
                vscode.window.showInformationMessage('No custom templates to delete.');
                return;
            }
            const pick = await vscode.window.showQuickPick(customTemplates.map(t => ({ label: t.name, description: t.description, template: t })), { placeHolder: 'Select template to delete' });
            if (pick) {
                ctx.templateManager.deleteTemplate(pick.template.id);
                await ctx.templateManager.saveToSettings();
                vscode.window.showInformationMessage(`Template "${pick.label}" deleted.`);
            }
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.quickTeamCoding', async () => {
        const coderTemplate = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.CODER)[0];
        const reviewerTemplate = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.REVIEWER)[0];
        const testerTemplate = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.TESTER)[0];
        if (!coderTemplate || !reviewerTemplate || !testerTemplate) {
            vscode.window.showErrorMessage('Missing required templates (coder, reviewer, tester)');
            return;
        }
        const team = ctx.teamManager.createTeam('Coding Team');
        vscode.window.showInformationMessage('Spawning coding team (coder + reviewer + tester)...');
        for (const tmpl of [coderTemplate, reviewerTemplate, testerTemplate]) {
            const agent = await spawnAgentFromTemplate(tmpl, ctx, team.id);
            if (agent) {
                ctx.teamManager.addAgentToTeam(team.id, agent.id);
            }
        }
        const crPipeline = ctx.pipelineEngine.getAllPipelines().find(p => p.name === 'Code Review Pipeline');
        if (crPipeline) {
            ctx.teamManager.setPipelineForTeam(team.id, crPipeline.id);
        }
        ctx.updateDashboard();
        vscode.window.showInformationMessage('Coding team ready!');
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.quickTeamResearch', async () => {
        const researcherTemplate = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.RESEARCHER)[0];
        const coderTemplate = ctx.templateManager.getTemplatesByRole(types_1.AgentRole.CODER)[0];
        if (!researcherTemplate || !coderTemplate) {
            vscode.window.showErrorMessage('Missing required templates (researcher, coder)');
            return;
        }
        const team = ctx.teamManager.createTeam('Research Team');
        vscode.window.showInformationMessage('Spawning research team (2 researchers + 1 coder)...');
        for (const tmpl of [researcherTemplate, researcherTemplate, coderTemplate]) {
            const agent = await spawnAgentFromTemplate(tmpl, ctx, team.id);
            if (agent) {
                ctx.teamManager.addAgentToTeam(team.id, agent.id);
            }
        }
        const riPipeline = ctx.pipelineEngine.getAllPipelines().find(p => p.name === 'Research & Implement');
        if (riPipeline) {
            ctx.teamManager.setPipelineForTeam(team.id, riPipeline.id);
        }
        ctx.updateDashboard();
        vscode.window.showInformationMessage('Research team ready!');
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.createPipelineNL', async () => {
        const description = await vscode.window.showInputBox({
            prompt: 'Describe what the pipeline should do',
            placeHolder: 'e.g., "Write code, review it, then test it"'
        });
        if (!description) {
            return;
        }
        vscode.window.showInformationMessage('Creating pipeline from description...');
        try {
            const pipeline = await ctx.pipelineEngine.createPipelineFromDescription(description);
            ctx.graphView.show();
            ctx.graphView.setPipeline(pipeline);
            vscode.window.showInformationMessage(`Pipeline "${pipeline.name}" created with ${pipeline.stages.length} stages.`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create pipeline: ${error}`);
        }
    }));
    disposables.push(vscode.commands.registerCommand('tmux-agents.openKanban', () => {
        ctx.kanbanView.show();
        ctx.updateKanban();
    }));
    return disposables;
}
//# sourceMappingURL=agentCommands.js.map
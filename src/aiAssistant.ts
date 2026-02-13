import * as vscode from 'vscode';
import { AIAssistantManager as CoreAIAssistantManager, AIAssistantConfig, ProviderConfig } from './core/aiAssistant';
import { AIProvider, AIStatus, AISessionInfo, CcPaneMetadata, TmuxPane } from './types';
import { TmuxService } from './tmuxService';

/**
 * VS Code adapter for AIAssistantManager
 * Reads config from VS Code settings and delegates to core implementation
 */
export class AIAssistantManager {
    private core: CoreAIAssistantManager;

    constructor() {
        // Initialize core with current VS Code config
        this.core = new CoreAIAssistantManager(this.loadConfigFromVSCode());

        // Watch for config changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('tmuxAgents')) {
                this.core.setConfig(this.loadConfigFromVSCode());
            }
        });
    }

    /**
     * Load config from VS Code workspace settings
     */
    private loadConfigFromVSCode(): AIAssistantConfig {
        const cfg = vscode.workspace.getConfiguration('tmuxAgents');
        return {
            defaultProvider: cfg.get<AIProvider>('defaultProvider'),
            fallbackProvider: cfg.get<AIProvider>('fallbackProvider'),
            aiProviders: cfg.get<Record<string, Partial<ProviderConfig>>>('aiProviders'),
            defaultWorkingDirectory: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        };
    }

    // ─── Delegate all methods to core ──────────────────────────────────

    getDefaultProvider(): AIProvider {
        return this.core.getDefaultProvider();
    }

    getFallbackProvider(): AIProvider {
        return this.core.getFallbackProvider();
    }

    resolveProvider(override?: AIProvider, laneProvider?: AIProvider): AIProvider {
        return this.core.resolveProvider(override, laneProvider);
    }

    resolveModel(taskModel?: string, laneModel?: string): string | undefined {
        return this.core.resolveModel(taskModel, laneModel);
    }

    detectAIProvider(command: string): AIProvider | null {
        return this.core.detectAIProvider(command);
    }

    detectAIStatus(provider: AIProvider, capturedContent: string): AIStatus {
        return this.core.detectAIStatus(provider, capturedContent);
    }

    getLaunchCommand(provider: AIProvider, cwd?: string): string {
        return this.core.getLaunchCommand(provider, cwd);
    }

    getAutoPilotFlags(provider: AIProvider): string[] {
        return this.core.getAutoPilotFlags(provider);
    }

    getInteractiveLaunchCommand(provider: AIProvider, model?: string, autoPilot?: boolean): string {
        return this.core.getInteractiveLaunchCommand(provider, model, autoPilot);
    }

    getForkCommand(provider: AIProvider, sessionName: string, ccSessionId?: string): string {
        return this.core.getForkCommand(provider, sessionName, ccSessionId);
    }

    getSpawnConfig(provider: AIProvider, model?: string): { command: string; args: string[]; env: Record<string, string>; cwd?: string; shell: boolean } {
        return this.core.getSpawnConfig(provider, model);
    }

    enrichPane(pane: TmuxPane): TmuxPane {
        return this.core.enrichPane(pane);
    }

    mapCcStateToAIStatus(ccState: string): AIStatus | null {
        return this.core.mapCcStateToAIStatus(ccState);
    }

    parseCcMetadata(options: Record<string, string>): CcPaneMetadata {
        return this.core.parseCcMetadata(options);
    }

    enrichPaneWithOptions(pane: TmuxPane, ccOptions: Record<string, string>): TmuxPane {
        return this.core.enrichPaneWithOptions(pane, ccOptions);
    }

    isCliAvailable(provider: AIProvider): boolean {
        return this.core.isCliAvailable(provider);
    }

    getFirstAvailableProvider(): AIProvider | null {
        return this.core.getFirstAvailableProvider();
    }

    async createAISession(
        provider: AIProvider,
        service: TmuxService,
        sessionName: string,
        cwd?: string,
    ): Promise<void> {
        // Use VS Code TmuxService directly instead of delegating to core
        // The core expects a different interface (numeric indexes vs string indexes)
        await service.newSession(sessionName);

        const launchCmd = this.core.getLaunchCommand(provider, cwd);
        // VS Code TmuxService uses string indexes
        const windowIndex = '0';
        const paneIndex = '0';

        // If a cwd is specified, cd there first
        if (cwd) {
            await service.sendKeys(sessionName, windowIndex, paneIndex, `cd ${cwd}`);
            await service.sendKeys(sessionName, windowIndex, paneIndex, 'Enter');
        }

        await service.sendKeys(sessionName, windowIndex, paneIndex, launchCmd);
        await service.sendKeys(sessionName, windowIndex, paneIndex, 'Enter');
    }
}

import { Logger } from './log';
import { DaemonConfig } from './config';
export interface ReconciliationResult {
    totalAgents: number;
    reconnected: number;
    lost: number;
    errors: number;
    details: {
        agentId: string;
        status: 'reconnected' | 'lost' | 'error';
        message?: string;
    }[];
}
export declare class Reconciler {
    private logger;
    private config;
    constructor(config: DaemonConfig, logger: Logger);
    reconcile(db: any, orchestrator: any): Promise<ReconciliationResult>;
    private loadActiveAgents;
    private getRuntimeById;
    private checkAgentAlive;
    private checkTmuxSession;
    private checkDockerContainer;
    private checkKubernetesPod;
    private checkSshTmuxSession;
    private reconnectAgent;
    private markAgentLost;
}

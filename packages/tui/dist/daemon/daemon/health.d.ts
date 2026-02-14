import { DaemonConfig, RuntimeConfig } from './config';
import { Logger } from './log';
export interface HealthReport {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
    pid: number;
    timestamp: string;
    components: {
        database: ComponentHealth;
        runtimes: Record<string, ComponentHealth>;
        servers: {
            unixSocket?: ComponentHealth;
            http?: ComponentHealth;
            webSocket?: ComponentHealth;
        };
    };
}
export interface ComponentHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    lastCheck?: string;
    details?: any;
}
export declare class HealthChecker {
    private startTime;
    private logger;
    private config;
    constructor(config: DaemonConfig, logger: Logger);
    checkDatabase(db: any): Promise<ComponentHealth>;
    checkRuntime(runtime: RuntimeConfig): Promise<ComponentHealth>;
    private checkLocalTmux;
    private checkDocker;
    private checkKubernetes;
    private checkSsh;
    checkServer(type: 'unixSocket' | 'http' | 'webSocket', listening: boolean, error?: string): ComponentHealth;
    generateReport(db: any, serverStatus: {
        unixSocket?: boolean;
        http?: boolean;
        webSocket?: boolean;
    }): Promise<HealthReport>;
}

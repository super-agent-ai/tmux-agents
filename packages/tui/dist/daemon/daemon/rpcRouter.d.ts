import { Logger } from './log';
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: any;
}
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id?: string | number | null;
    result?: any;
    error?: JsonRpcError;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}
export declare const RPC_ERRORS: {
    PARSE_ERROR: {
        code: number;
        message: string;
    };
    INVALID_REQUEST: {
        code: number;
        message: string;
    };
    METHOD_NOT_FOUND: {
        code: number;
        message: string;
    };
    INVALID_PARAMS: {
        code: number;
        message: string;
    };
    INTERNAL_ERROR: {
        code: number;
        message: string;
    };
    SERVER_ERROR: {
        code: number;
        message: string;
    };
};
export interface RpcContext {
    db: any;
    orchestrator: any;
    pipelineEngine: any;
    teamManager: any;
    kanbanManager: any;
    runtimeManager?: any;
    config: any;
    healthChecker: any;
    server: any;
}
export declare class RpcRouter {
    private logger;
    private context;
    private handlers;
    constructor(context: RpcContext, logger: Logger);
    private registerHandlers;
    handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
    private successResponse;
    private errorResponse;
    private agentList;
    private agentGet;
    private agentSpawn;
    private agentKill;
    private agentSendPrompt;
    private agentGetOutput;
    private agentGetStatus;
    private agentGetAttachCommand;
    private taskList;
    private taskGet;
    private taskSubmit;
    private taskMove;
    private taskCancel;
    private taskDelete;
    private taskUpdate;
    private teamList;
    private teamCreate;
    private teamDelete;
    private teamAddAgent;
    private teamRemoveAgent;
    private teamQuickCode;
    private teamQuickResearch;
    private pipelineList;
    private pipelineCreate;
    private pipelineRun;
    private pipelineGetStatus;
    private pipelineGetActive;
    private pipelinePause;
    private pipelineResume;
    private pipelineCancel;
    private kanbanListLanes;
    private kanbanCreateLane;
    private kanbanEditLane;
    private kanbanDeleteLane;
    private kanbanGetBoard;
    private kanbanStartTask;
    private kanbanStopTask;
    private runtimeList;
    private runtimeAdd;
    private runtimeRemove;
    private runtimePing;
    private daemonHealth;
    private daemonConfig;
    private daemonReload;
    private daemonStats;
    private daemonShutdown;
    private fanoutRun;
    private groupBy;
}

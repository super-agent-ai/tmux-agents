export declare enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}
export interface LogEntry {
    ts: string;
    level: LogLevel;
    component: string;
    msg: string;
    data?: any;
}
export interface LoggerConfig {
    /** Minimum log level to output */
    minLevel: LogLevel;
    /** Path to log file */
    logFilePath: string;
    /** Whether to log to stdout (foreground mode) */
    logToStdout: boolean;
    /** Maximum log file size in bytes before rotation (default: 50MB) */
    maxFileSize?: number;
    /** Number of rotated log files to keep (default: 5) */
    maxFiles?: number;
}
export declare class Logger {
    private config;
    private fileStream?;
    constructor(config: LoggerConfig);
    private initializeFileStream;
    private rotateIfNeeded;
    private shouldLog;
    private write;
    debug(component: string, msg: string, data?: any): void;
    info(component: string, msg: string, data?: any): void;
    warn(component: string, msg: string, data?: any): void;
    error(component: string, msg: string, data?: any): void;
    close(): void;
    checkRotation(): void;
}

export interface OutputOptions {
    json?: boolean;
}

export function output(data: any, options: OutputOptions = {}): void {
    if (options.json) {
        console.log(JSON.stringify(data, null, 2));
    } else if (typeof data === 'string') {
        console.log(data);
    } else if (data === null || data === undefined) {
        // Silent for void/null results
    } else {
        console.log(data);
    }
}

export function error(message: string, exitCode: number = 1): never {
    console.error(message);
    process.exit(exitCode);
}

export function success(message?: string): void {
    if (message) {
        console.log(message);
    }
    process.exit(0);
}

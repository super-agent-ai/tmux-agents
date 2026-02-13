export function generateZshCompletion(programName: string): string {
    return `
#compdef ${programName}

_${programName}() {
    local -a commands
    commands=(
        'daemon:Manage daemon'
        'agent:Manage agents'
        'task:Manage tasks'
        'team:Manage teams'
        'pipeline:Manage pipelines'
        'runtime:Manage runtimes'
        'fan-out:Fan-out to multiple agents'
        'service:Manage system service'
        'health:Health check'
        'mcp:Start MCP server'
        'tui:Launch TUI'
        'web:Launch web UI'
        'completion:Generate shell completion'
    )

    local -a daemon_commands
    daemon_commands=(
        'start:Start daemon'
        'stop:Stop daemon'
        'restart:Restart daemon'
        'run:Run in foreground'
        'status:Show status'
        'logs:View logs'
    )

    local -a agent_commands
    agent_commands=(
        'list:List agents'
        'spawn:Spawn agent'
        'kill:Kill agent'
        'send:Send prompt'
        'output:Get output'
        'attach:Get attach command'
        'status:Get status'
        'pick:Interactive picker'
    )

    local -a task_commands
    task_commands=(
        'list:List tasks'
        'submit:Submit task'
        'move:Move task'
        'show:Show task'
        'cancel:Cancel task'
        'board:Show board'
        'pick:Interactive picker'
    )

    if (( CURRENT == 2 )); then
        _describe -t commands 'commands' commands
        return
    fi

    case "\${words[2]}" in
        daemon)
            if (( CURRENT == 3 )); then
                _describe -t daemon-commands 'daemon commands' daemon_commands
            fi
            ;;
        agent)
            if (( CURRENT == 3 )); then
                _describe -t agent-commands 'agent commands' agent_commands
            fi
            ;;
        task)
            if (( CURRENT == 3 )); then
                _describe -t task-commands 'task commands' task_commands
            fi
            ;;
    esac
}

_${programName} "$@"
`.trim();
}

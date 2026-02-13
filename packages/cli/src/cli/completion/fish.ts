export function generateFishCompletion(programName: string): string {
    return `
# ${programName} fish completion

# Main commands
complete -c ${programName} -f -n "__fish_use_subcommand" -a "daemon" -d "Manage daemon"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "agent" -d "Manage agents"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "task" -d "Manage tasks"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "team" -d "Manage teams"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "pipeline" -d "Manage pipelines"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "runtime" -d "Manage runtimes"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "fan-out" -d "Fan-out to agents"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "service" -d "Manage service"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "health" -d "Health check"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "mcp" -d "Start MCP server"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "tui" -d "Launch TUI"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "web" -d "Launch web UI"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "completion" -d "Generate completion"

# daemon subcommands
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "start" -d "Start daemon"
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "stop" -d "Stop daemon"
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "restart" -d "Restart daemon"
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "run" -d "Run in foreground"
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "status" -d "Show status"
complete -c ${programName} -f -n "__fish_seen_subcommand_from daemon" -a "logs" -d "View logs"

# agent subcommands
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "list" -d "List agents"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "spawn" -d "Spawn agent"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "kill" -d "Kill agent"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "send" -d "Send prompt"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "output" -d "Get output"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "attach" -d "Attach"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "status" -d "Get status"
complete -c ${programName} -f -n "__fish_seen_subcommand_from agent" -a "pick" -d "Pick agent"

# task subcommands
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "list" -d "List tasks"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "submit" -d "Submit task"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "move" -d "Move task"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "show" -d "Show task"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "cancel" -d "Cancel task"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "board" -d "Show board"
complete -c ${programName} -f -n "__fish_seen_subcommand_from task" -a "pick" -d "Pick task"

# Common options
complete -c ${programName} -l json -d "Output JSON"
complete -c ${programName} -l help -d "Show help"
complete -c ${programName} -l version -d "Show version"
`.trim();
}

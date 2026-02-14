"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBashCompletion = generateBashCompletion;
function generateBashCompletion(programName) {
    return `
# ${programName} bash completion

_${programName}_completions() {
    local cur prev words cword
    _init_completion || return

    case "\${words[1]}" in
        daemon)
            COMPREPLY=( $(compgen -W "start stop restart run status logs" -- "$cur") )
            return 0
            ;;
        agent)
            COMPREPLY=( $(compgen -W "list spawn kill send output attach status pick" -- "$cur") )
            return 0
            ;;
        task)
            COMPREPLY=( $(compgen -W "list submit move show cancel board pick" -- "$cur") )
            return 0
            ;;
        team)
            COMPREPLY=( $(compgen -W "list create delete quick-code quick-research" -- "$cur") )
            return 0
            ;;
        pipeline)
            COMPREPLY=( $(compgen -W "list run status cancel" -- "$cur") )
            return 0
            ;;
        runtime)
            COMPREPLY=( $(compgen -W "list add remove" -- "$cur") )
            return 0
            ;;
        service)
            COMPREPLY=( $(compgen -W "install uninstall status" -- "$cur") )
            return 0
            ;;
    esac

    if [[ $cword -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "daemon agent task team pipeline runtime fan-out service health mcp tui web completion" -- "$cur") )
    fi
}

complete -F _${programName}_completions ${programName}
`.trim();
}
//# sourceMappingURL=bash.js.map
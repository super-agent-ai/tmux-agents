/**
 * Runtime abstraction interfaces for tmux-agents.
 *
 * All runtimes (local, SSH, Docker, K8s) use tmux as the execution abstraction.
 * The only difference is the exec prefix passed to TmuxService:
 * - local: ""
 * - ssh: "ssh host"
 * - docker: "docker exec <cid>"
 * - k8s: "kubectl exec <pod> -n <ns> --"
 */
export {};
//# sourceMappingURL=types.js.map
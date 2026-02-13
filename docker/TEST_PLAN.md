# Docker Runtime Test Plan

## Prerequisites

1. **Docker Daemon Running**
   ```bash
   docker info
   ```

2. **Build Base Image**
   ```bash
   cd docker
   ./build.sh
   ```

3. **Verify Image**
   ```bash
   docker images | grep tmux-agents-base
   ```

## Unit Tests

Run unit tests without Docker daemon:

```bash
npm run test -- src/runtimes/__tests__/runtimeManager.test.ts
npm run test -- src/runtimes/__tests__/dockerRuntime.test.ts
```

**Expected:** All 20 tests pass

## Integration Tests

Run integration tests with Docker daemon:

```bash
npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts
```

**Test Coverage:**

1. ✅ Ping Docker daemon
2. ✅ Spawn agent in container
3. ✅ List spawned agents
4. ✅ Kill agent (stop + remove container)
5. ✅ Get TmuxService for container
6. ✅ Apply resource limits
7. ✅ Mount working directory
8. ✅ Reconnect to existing containers after restart

## Manual Testing

### Test 1: Basic Agent Spawn

```bash
# Start Docker daemon
docker info

# Build image
cd docker && ./build.sh

# Run integration tests
npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts
```

### Test 2: Container Inspection

```bash
# Spawn an agent (via integration test)
# Then inspect container
docker ps -a --filter "label=tmux-agents=true"

# Check labels
docker inspect <container-id> | jq '.[0].Config.Labels'

# Check resource limits
docker inspect <container-id> | jq '.[0].HostConfig | {Memory, NanoCpus}'

# Check mounts
docker inspect <container-id> | jq '.[0].Mounts'
```

### Test 3: Tmux Session

```bash
# Attach to running agent
docker ps --filter "label=tmux-agents=true" -q | head -1 | xargs -I {} docker exec -it {} tmux attach -t agent

# Verify tmux session is running
# Exit with Ctrl+b, d
```

### Test 4: Network

```bash
# Verify network exists
docker network inspect tmux-agents

# Verify containers are connected
docker network inspect tmux-agents | jq '.[0].Containers'
```

### Test 5: Cleanup

```bash
# Remove all agent containers
docker ps -a --filter "label=tmux-agents=true" -q | xargs docker rm -f

# Remove network
docker network rm tmux-agents
```

## Performance Testing

### Resource Usage

```bash
# Spawn 10 agents
# Monitor resource usage
docker stats --no-stream

# Verify each container respects limits
docker inspect <container-id> | jq '.[0].HostConfig.Memory'
```

### Startup Time

```bash
# Time agent spawn
time npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts -t "should spawn an agent"

# Expected: < 30 seconds
```

## Failure Testing

### Test 1: Docker Daemon Down

```bash
# Stop Docker daemon
# Run integration tests
npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts

# Expected: Graceful error messages
```

### Test 2: Missing Image

```bash
# Remove image
docker rmi tmux-agents-base:latest

# Run integration tests
npm run test -- src/runtimes/__tests__/dockerRuntime.integration.test.ts

# Expected: Image pull or build error
```

### Test 3: Invalid Config

```bash
# Test with invalid working directory
# Test with invalid resource limits
# Expected: Validation errors
```

## Security Testing

### Test 1: Auth Token Mounts

```bash
# Verify auth tokens are mounted read-only
docker inspect <container-id> | jq '.[0].Mounts[] | select(.Destination | contains("claude"))'

# Expected: Mode = "ro"
```

### Test 2: Container Isolation

```bash
# Verify containers cannot access host resources
docker exec <container-id> ls /host

# Expected: Permission denied or not found
```

## Definition of Done Checklist

- [x] AgentRuntime interface defined
- [x] DockerRuntime creates containers
- [x] TmuxService("docker exec <cid>") works
- [x] Full agent spawn flow implemented
- [x] Auth tokens auto-mounted
- [x] Resource limits work
- [x] Dockerfile builds
- [x] Reconciler can reconnect after restart
- [x] All unit tests pass (20/20)
- [ ] Integration tests pass (requires Docker daemon)
- [ ] Docker image built and tested

## Notes

- Integration tests require Docker daemon running
- Tests automatically cleanup containers after completion
- Network is created/removed per test suite
- Container logs available via `docker logs <container-id>`

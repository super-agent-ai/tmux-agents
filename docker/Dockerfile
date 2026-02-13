# tmux-agents-base: Base image for agent containers
# Includes tmux, git, curl, jq, and Node.js

FROM node:22-slim

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    tmux \
    git \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy tmux configuration
COPY tmux.conf /etc/tmux.conf

# Create workspace directory
WORKDIR /workspace

# Entrypoint: Start tmux server with a session named 'agent' and keep container alive
ENTRYPOINT ["sh", "-c", "tmux new-session -d -s agent && sleep infinity"]

#!/bin/bash
# Build script for tmux-agents Docker images

set -e

echo "Building tmux-agents-base:latest..."
docker build -t tmux-agents-base:latest .

echo ""
echo "Building tmux-agents-base-gpu:latest..."
docker build -f Dockerfile.gpu -t tmux-agents-base-gpu:latest .

echo ""
echo "Creating tmux-agents network..."
docker network create tmux-agents 2>/dev/null || echo "Network already exists"

echo ""
echo "Build complete!"
echo ""
echo "Images:"
docker images | grep tmux-agents-base

echo ""
echo "To test the base image:"
echo "  docker run -it --rm tmux-agents-base:latest tmux attach -t agent"

.PHONY: compile test watch package install uninstall clean test-integration test-all \
       build-cli build-tui build-mcp build-k8s build-workspaces \
       package-cli package-tui package-mcp package-install package-all \
       install-cli install-skill update-skill publish-all

VERSION := $(shell node -p "require('./package.json').version")
VSIX    := tmux-agents-$(VERSION).vsix

# ── Dependencies ─────────────────────────────────────────

node_modules: package.json
	npm install

# ── Build ────────────────────────────────────────────────

compile: node_modules
	npm run compile

build-cli: compile
	npm run build -w packages/cli

build-tui: compile
	npm run build -w packages/tui

build-mcp: compile
	npm run build -w packages/mcp

build-k8s: compile
	npm run build -w packages/k8s-runtime

build-workspaces: build-cli build-tui build-mcp build-k8s

# ── Test ─────────────────────────────────────────────────

test:
	npx vitest run --no-coverage

test-integration: compile
	npx vscode-test

test-all: test test-integration

# ── Watch ────────────────────────────────────────────────

watch:
	npm run watch

# ── Packaging ────────────────────────────────────────────

package: compile
	npx @vscode/vsce package --no-dependencies
	@# --no-dependencies strips ALL node_modules; re-inject runtime deps
	@mkdir -p .vsix-inject/extension/node_modules
	@cp -r node_modules/ws .vsix-inject/extension/node_modules/
	@cp -r node_modules/zod .vsix-inject/extension/node_modules/
	@cd .vsix-inject && zip -rq ../$(VSIX) extension/node_modules/
	@rm -rf .vsix-inject
	@echo "Injected ws + zod into $(VSIX)"

package-cli: build-cli
	npm pack -w packages/cli

package-tui: build-tui
	npm pack -w packages/tui

package-mcp: build-mcp
	npm pack -w packages/mcp

package-install: build-workspaces
	npm run build -w packages/install
	npm pack -w packages/install

package-all: package package-cli package-tui package-mcp package-install
	@echo ""
	@echo "All packages built (v$(VERSION)):"
	@ls -la *.vsix *.tgz 2>/dev/null

# ── Install ──────────────────────────────────────────────

install: package
	code-server --install-extension $(VSIX) --force
	code --install-extension $(VSIX) --force
	@echo "Installed tmux-agents v$(VERSION). Reload VS Code to activate."

install-cli: package-install
	npm install -g tmux-agents-*.tgz

install-skill: build-cli
	@TMUX_AGENTS_SKILL_DIR=packages/cli/skill node packages/cli/dist/cli/cli/index.js skill install --force
	@echo "Skill v$(VERSION) installed to ~/.claude/skills/tmux-agents/"

update-skill: install-skill

uninstall:
	@which code-server >/dev/null 2>&1 && code-server --uninstall-extension super-agent.tmux-agents || true
	@which code >/dev/null 2>&1 && code --uninstall-extension super-agent.tmux-agents || true

# ── Clean ────────────────────────────────────────────────

clean:
	rm -rf out tmux-agents-*.vsix *.tgz

# ── Publish ──────────────────────────────────────────────

publish-all: build-workspaces
	npm publish -w packages/cli
	npm publish -w packages/tui
	npm publish -w packages/mcp
	npm run build -w packages/install
	npm publish -w packages/install

.PHONY: compile test watch package install uninstall clean test-integration test-all

VERSION := $(shell node -p "require('./package.json').version")
VSIX    := tmux-agents-$(VERSION).vsix

node_modules: package.json
	npm install

compile: node_modules
	npm run compile

test:
	npx vitest run --no-coverage

watch:
	npm run watch

package: compile
	npx @vscode/vsce package --no-dependencies

install: package
	code --install-extension $(VSIX) --force
	@echo "Installed tmux-agents v$(VERSION). Reload VS Code to activate."

uninstall:
	code --uninstall-extension super-agent.tmux-agents || true

clean:
	rm -rf out tmux-agents-*.vsix

test-integration: compile
	npx vscode-test

test-all: test test-integration

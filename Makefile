.PHONY: compile test install clean

compile:
	npm run compile

test:
	npm test

install: compile
	npx @vscode/vsce package --no-dependencies
	code --install-extension tmux-agents-0.1.0.vsix --force

clean:
	rm -rf out tmux-agents-*.vsix

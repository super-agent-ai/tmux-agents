import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { TmuxServiceManager } from './serviceManager';
import { gatherFullExtensionContext, formatFullContextForPrompt, ContextGatheringDeps } from './tmuxContextProvider';
import { ApiCatalog, ParsedAIResponse } from './apiCatalog';
import { AIAssistantManager } from './aiAssistant';
import { AIProvider } from './types';

const execAsync = util.promisify(cp.exec);
const readFile = util.promisify(fs.readFile);
const fsStat = util.promisify(fs.stat);
const readdir = util.promisify(fs.readdir);

/** Run a command with stdin piped in (avoids shell escaping issues) */
function spawnWithStdin(command: string, args: string[], input: string, timeoutMs: number = 60000, onSpawn?: (proc: cp.ChildProcess) => void, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd, shell: true });
        if (onSpawn) { onSpawn(proc); }
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill();
            reject(new Error('Command timed out'));
        }, timeoutMs);
        proc.stdout!.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr!.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', (code: number | null) => {
            clearTimeout(timer);
            if (timedOut) { return; }
            if (code === 0) { resolve(stdout); }
            else { reject(new Error(stderr || stdout || `Process exited with code ${code}`)); }
        });
        proc.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
        proc.stdin!.on('error', () => {});
        proc.on('spawn', () => { if (proc.stdin!.writable) { proc.stdin!.write(input); proc.stdin!.end(); } });
    });
}

/** Max extracted text per single file (characters) */
const MAX_FILE_CHARS = 100_000;
/** Max total chars across all files in a folder scan */
const MAX_FOLDER_CHARS = 200_000;
/** Max files to read content from inside a folder */
const MAX_FOLDER_FILES_READ = 50;
/** Max folder scan depth */
const MAX_FOLDER_DEPTH = 5;

/** Directories to skip during folder scan */
const SKIP_DIRS = new Set([
    'node_modules', '.git', '__pycache__', '.venv', 'venv', '.env',
    'dist', 'build', 'out', '.next', '.nuxt', '.cache', 'vendor',
    'target', '.idea', 'coverage', '.tox', '.mypy_cache', '.pytest_cache',
    'bower_components', '.svn', '.hg', '.DS_Store', 'Pods',
]);

/** Extensions that are plain text and can be read directly as UTF-8 */
const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv',
    '.xml', '.yaml', '.yml', '.log', '.conf', '.cfg', '.ini', '.toml',
    '.env', '.properties', '.sh', '.bash', '.zsh', '.fish', '.bat',
    '.cmd', '.ps1', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw', '.rb', '.go', '.rs', '.java', '.kt', '.kts',
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.cs',
    '.swift', '.php', '.html', '.htm', '.css', '.scss', '.sass',
    '.less', '.sql', '.r', '.lua', '.pl', '.pm', '.ex', '.exs',
    '.hs', '.ml', '.mli', '.scala', '.clj', '.cljs', '.dart',
    '.vim', '.el', '.lisp', '.erl', '.hrl', '.tf', '.hcl',
    '.dockerfile', '.makefile', '.cmake', '.gradle', '.sbt',
    '.graphql', '.gql', '.proto', '.thrift', '.avsc',
    '.rst', '.tex', '.bib', '.org', '.adoc', '.asciidoc',
    '.diff', '.patch', '.gitignore', '.editorconfig',
    '.svg', '.plist', '.strings',
]);

/** Well-known text filenames without extension */
const TEXT_FILENAMES = new Set([
    'makefile', 'dockerfile', 'vagrantfile', 'gemfile',
    'rakefile', 'procfile', 'brewfile', 'license', 'readme',
    'changelog', 'authors', 'contributors', 'todo', 'notes',
    'cmakelists.txt',
]);

/** Max agentic loop iterations before forcing stop */
const MAX_AGENT_STEPS = 10;

interface ConversationEntry {
    role: 'user' | 'assistant' | 'tool';
    content: string;
}

interface AttachedItem {
    name: string;       // display name
    filePath: string;   // absolute path
    isFolder: boolean;
    size: number;       // bytes for file, total scanned bytes for folder
    fileCount?: number; // number of files inside folder
    content?: string;   // extracted text
}

interface FolderScanEntry {
    relativePath: string;
    isDir: boolean;
    size: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private refreshCallback?: () => void;
    private attachedItems: AttachedItem[] = [];
    private selectedModel: string = 'opus';
    private conversationHistory: ConversationEntry[] = [];
    private abortRequested: boolean = false;
    private voiceProc: cp.ChildProcess | null = null;
    private voiceTmpFile: string = '';

    // ── Streaming CLI State ────────────────────────────────────────────
    private selectedProvider: AIProvider = AIProvider.CLAUDE;
    private currentProc: cp.ChildProcess | null = null;

    constructor(
        private readonly serviceManager: TmuxServiceManager,
        private readonly extensionUri: vscode.Uri,
        private readonly apiCatalog: ApiCatalog,
        private readonly contextDeps: ContextGatheringDeps,
        private readonly aiManager?: AIAssistantManager
    ) {
        if (this.aiManager) {
            this.selectedProvider = this.aiManager.getDefaultProvider();
        }
    }

    public setRefreshCallback(cb: () => void): void {
        this.refreshCallback = cb;
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'send') {
                await this.handleUserMessage(msg.text);
            } else if (msg.type === 'importFile') {
                await this.handleImportFile();
            } else if (msg.type === 'importFolder') {
                await this.handleImportFolder();
            } else if (msg.type === 'removeFile') {
                this.removeItem(msg.index);
            } else if (msg.type === 'clearHistory') {
                this.conversationHistory = [];
                this.postMessage({ type: 'clearMessages' });
            } else if (msg.type === 'setModel') {
                this.selectedModel = msg.model;
            } else if (msg.type === 'setProvider') {
                this.selectedProvider = msg.provider as AIProvider;
                const models = this.getProviderModels();
                this.selectedModel = models[0].value;
                this.postMessage({ type: 'updateModels', models, selected: this.selectedModel });
            } else if (msg.type === 'stop') {
                this.abortRequested = true;
                if (this.currentProc) {
                    this.currentProc.kill();
                    this.currentProc = null;
                }
            } else if (msg.type === 'startVoice') {
                await this.startVoiceRecording();
            } else if (msg.type === 'stopVoice') {
                await this.stopVoiceRecording();
            }
        });
    }

    // ── Voice Input ──────────────────────────────────────────────────────────

    private async startVoiceRecording(): Promise<void> {
        if (this.voiceProc) { return; }

        // Check for sox (rec command)
        try {
            cp.execSync('which rec', { stdio: 'ignore' });
        } catch {
            this.postMessage({ type: 'voiceError', text: 'Voice input requires SoX. Install with: brew install sox (macOS) or apt install sox (Linux)' });
            return;
        }

        const tmpDir = require('os').tmpdir();
        this.voiceTmpFile = path.join(tmpDir, `tmux-agents-voice-${Date.now()}.wav`);

        try {
            // Record 16kHz mono WAV via sox's rec command
            this.voiceProc = cp.spawn('rec', [
                '-r', '16000', '-c', '1', '-b', '16',
                this.voiceTmpFile
            ], { stdio: ['ignore', 'ignore', 'ignore'] });

            this.voiceProc.on('error', () => {
                this.voiceProc = null;
                this.postMessage({ type: 'voiceError', text: 'Failed to start recording.' });
            });

            this.postMessage({ type: 'voiceStarted' });
        } catch (e: any) {
            this.voiceProc = null;
            this.postMessage({ type: 'voiceError', text: `Recording failed: ${e.message}` });
        }
    }

    private async stopVoiceRecording(): Promise<void> {
        if (!this.voiceProc) { return; }

        // Send SIGTERM to stop recording gracefully
        this.voiceProc.kill('SIGTERM');
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 2000);
            this.voiceProc!.on('close', () => { clearTimeout(timeout); resolve(); });
        });
        this.voiceProc = null;

        if (!fs.existsSync(this.voiceTmpFile)) {
            this.postMessage({ type: 'voiceError', text: 'No audio recorded.' });
            return;
        }

        this.postMessage({ type: 'voiceTranscribing' });

        try {
            const transcription = await this.transcribeAudio(this.voiceTmpFile);
            // Clean up temp file
            fs.unlink(this.voiceTmpFile, () => {});
            this.voiceTmpFile = '';

            if (transcription.trim()) {
                this.postMessage({ type: 'voiceResult', text: transcription.trim() });
            } else {
                this.postMessage({ type: 'voiceError', text: 'No speech detected.' });
            }
        } catch (e: any) {
            fs.unlink(this.voiceTmpFile, () => {});
            this.voiceTmpFile = '';
            this.postMessage({ type: 'voiceError', text: `Transcription failed: ${e.message}` });
        }
    }

    private async transcribeAudio(audioPath: string): Promise<string> {
        // Try whisper CLI first (OpenAI whisper or whisper.cpp)
        const whisperCommands = [
            { cmd: 'whisper', args: [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', path.dirname(audioPath)] },
            { cmd: 'whisper-cpp', args: ['-m', 'base', '-f', audioPath, '--no-timestamps'] },
        ];

        for (const w of whisperCommands) {
            try {
                cp.execSync(`which ${w.cmd}`, { stdio: 'ignore' });
                const result = cp.execSync(
                    `${w.cmd} ${w.args.map(a => `"${a}"`).join(' ')}`,
                    { timeout: 30000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
                );
                // whisper CLI outputs transcription to stdout or to a .txt file
                if (result && result.trim()) {
                    return result.trim();
                }
                // Check for .txt output file
                const txtPath = audioPath.replace(/\.wav$/, '.txt');
                if (fs.existsSync(txtPath)) {
                    const text = fs.readFileSync(txtPath, 'utf-8');
                    fs.unlink(txtPath, () => {});
                    return text.trim();
                }
            } catch {
                continue;
            }
        }

        // Fallback: use macOS built-in speech recognition via say/dictation or Python speech_recognition
        try {
            cp.execSync('which python3', { stdio: 'ignore' });
            const pyScript = `
import speech_recognition as sr
r = sr.Recognizer()
with sr.AudioFile("${audioPath.replace(/"/g, '\\"')}") as source:
    audio = r.record(source)
try:
    print(r.recognize_google(audio))
except sr.UnknownValueError:
    print("")
except sr.RequestError as e:
    print("")
`;
            const result = cp.execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`, {
                timeout: 30000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
            });
            if (result && result.trim()) {
                return result.trim();
            }
        } catch {
            // Python speech_recognition not available
        }

        throw new Error('No transcription backend found. Install whisper (pip install openai-whisper) or SpeechRecognition (pip install SpeechRecognition).');
    }

    // ── File Import ──────────────────────────────────────────────────────────

    private async handleImportFile(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Import File',
        });
        if (!uris || uris.length === 0) { return; }

        for (const uri of uris) {
            await this.importSingleFile(uri.fsPath);
        }
    }

    private async importSingleFile(filePath: string): Promise<void> {
        const name = path.basename(filePath);

        if (this.attachedItems.some(f => f.filePath === filePath)) {
            this.postMessage({ type: 'addMessage', role: 'error', text: `"${name}" is already attached.` });
            return;
        }

        try {
            const s = await fsStat(filePath);
            const content = await this.extractFileContent(filePath);
            this.attachedItems.push({
                name, filePath, isFolder: false,
                size: s.size, content
            });
            this.syncToWebview();
        } catch (e: any) {
            this.postMessage({ type: 'addMessage', role: 'error', text: `Failed to import "${name}": ${e.message}` });
        }
    }

    // ── Folder Import ────────────────────────────────────────────────────────

    private async handleImportFolder(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: 'Import Folder',
        });
        if (!uris || uris.length === 0) { return; }

        const folderPath = uris[0].fsPath;
        const folderName = path.basename(folderPath) + '/';

        if (this.attachedItems.some(f => f.filePath === folderPath)) {
            this.postMessage({ type: 'addMessage', role: 'error', text: `"${folderName}" is already attached.` });
            return;
        }

        this.postMessage({ type: 'addMessage', role: 'assistant', text: `Scanning folder "${folderName}"...` });

        try {
            const { tree, entries } = await this.scanFolder(folderPath);
            const fileEntries = entries.filter(e => !e.isDir);
            const totalSize = fileEntries.reduce((s, e) => s + e.size, 0);

            // Build tree listing
            const treeListing = `Folder: ${folderName}\nFiles: ${fileEntries.length}, Total size: ${this.formatBytes(totalSize)}\n\n${tree}`;

            // Read content of key text files (up to budget)
            const fileContents = await this.readFolderFiles(folderPath, fileEntries);

            const content = treeListing + (fileContents ? '\n\n' + fileContents : '');

            this.attachedItems.push({
                name: folderName, filePath: folderPath, isFolder: true,
                size: totalSize, fileCount: fileEntries.length, content
            });
            this.syncToWebview();
            this.postMessage({
                type: 'addMessage', role: 'assistant',
                text: `Imported "${folderName}" — ${fileEntries.length} files, ${this.formatBytes(totalSize)}`
            });
        } catch (e: any) {
            this.postMessage({ type: 'addMessage', role: 'error', text: `Failed to scan "${folderName}": ${e.message}` });
        }
    }

    private async scanFolder(
        rootPath: string, relativePath: string = '', depth: number = 0
    ): Promise<{ tree: string; entries: FolderScanEntry[] }> {
        const entries: FolderScanEntry[] = [];
        const treeLines: string[] = [];
        const currentPath = path.join(rootPath, relativePath);

        let items: string[];
        try {
            items = await readdir(currentPath);
        } catch {
            return { tree: '', entries: [] };
        }

        items.sort();

        for (const item of items) {
            if (item.startsWith('.') && SKIP_DIRS.has(item)) { continue; }
            if (SKIP_DIRS.has(item)) { continue; }

            const itemRelative = relativePath ? path.join(relativePath, item) : item;
            const itemFull = path.join(rootPath, itemRelative);
            const indent = '  '.repeat(depth);

            let s: fs.Stats;
            try {
                s = await fsStat(itemFull);
            } catch {
                continue;
            }

            if (s.isDirectory()) {
                entries.push({ relativePath: itemRelative + '/', isDir: true, size: 0 });
                treeLines.push(`${indent}${item}/`);

                if (depth < MAX_FOLDER_DEPTH) {
                    const sub = await this.scanFolder(rootPath, itemRelative, depth + 1);
                    entries.push(...sub.entries);
                    if (sub.tree) { treeLines.push(sub.tree); }
                } else {
                    treeLines.push(`${indent}  [... deeper levels omitted]`);
                }
            } else if (s.isFile()) {
                entries.push({ relativePath: itemRelative, isDir: false, size: s.size });
                treeLines.push(`${indent}${item}  (${this.formatBytes(s.size)})`);
            }
        }

        return { tree: treeLines.join('\n'), entries };
    }

    private async readFolderFiles(
        rootPath: string, fileEntries: FolderScanEntry[]
    ): Promise<string> {
        // Prioritize key files, then sort by size (smallest first to fit more)
        const priorityFiles = new Set([
            'readme.md', 'readme.txt', 'readme', 'package.json', 'cargo.toml',
            'pyproject.toml', 'setup.py', 'go.mod', 'gemfile', 'makefile',
            'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
            '.env.example', 'requirements.txt', 'pom.xml', 'build.gradle',
            'tsconfig.json', 'webpack.config.js', 'vite.config.ts',
        ]);

        const readable = fileEntries.filter(e => {
            const ext = path.extname(e.relativePath).toLowerCase();
            const basename = path.basename(e.relativePath).toLowerCase();
            return (TEXT_EXTENSIONS.has(ext) || TEXT_FILENAMES.has(basename)) && e.size < 500_000;
        });

        // Sort: priority files first, then by size ascending
        readable.sort((a, b) => {
            const aPri = priorityFiles.has(path.basename(a.relativePath).toLowerCase()) ? 0 : 1;
            const bPri = priorityFiles.has(path.basename(b.relativePath).toLowerCase()) ? 0 : 1;
            if (aPri !== bPri) { return aPri - bPri; }
            return a.size - b.size;
        });

        const parts: string[] = [];
        let totalChars = 0;
        let filesRead = 0;

        for (const entry of readable) {
            if (filesRead >= MAX_FOLDER_FILES_READ) { break; }
            if (totalChars >= MAX_FOLDER_CHARS) { break; }

            const fullPath = path.join(rootPath, entry.relativePath);
            try {
                const buf = await readFile(fullPath);
                // Skip binary
                if (buf.slice(0, 4096).includes(0)) { continue; }

                let text = buf.toString('utf-8');
                const remaining = MAX_FOLDER_CHARS - totalChars;
                if (text.length > remaining) {
                    text = text.slice(0, remaining) + '\n[... truncated]';
                }

                parts.push(`=== ${entry.relativePath} ===\n${text}`);
                totalChars += text.length;
                filesRead++;
            } catch {
                // skip unreadable files
            }
        }

        if (readable.length > filesRead) {
            parts.push(`\n[... ${readable.length - filesRead} more readable files not included]`);
        }

        return parts.join('\n\n');
    }

    // ── Shared helpers ───────────────────────────────────────────────────────

    private removeItem(index: number): void {
        if (index >= 0 && index < this.attachedItems.length) {
            this.attachedItems.splice(index, 1);
            this.syncToWebview();
        }
    }

    private syncToWebview(): void {
        this.postMessage({
            type: 'updateFiles',
            files: this.attachedItems.map(f => ({
                name: f.name,
                size: f.size,
                isFolder: f.isFolder,
                fileCount: f.fileCount,
                charCount: f.content?.length || 0,
            }))
        });
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) { return bytes + 'B'; }
        if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + 'KB'; }
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    // ── File content extraction ──────────────────────────────────────────────

    private async extractFileContent(filePath: string): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();
        const basename = path.basename(filePath).toLowerCase();

        if (!ext && TEXT_FILENAMES.has(basename)) { return this.readAsText(filePath); }
        if (TEXT_EXTENSIONS.has(ext)) { return this.readAsText(filePath); }
        if (ext === '.pdf') { return this.extractPdf(filePath); }
        if (['.docx', '.doc', '.rtf', '.odt'].includes(ext)) { return this.extractDocument(filePath); }

        return this.readAsTextWithFallback(filePath);
    }

    private async readAsText(filePath: string): Promise<string> {
        const buf = await readFile(filePath);
        const text = buf.toString('utf-8');
        return text.length > MAX_FILE_CHARS
            ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated at ${MAX_FILE_CHARS} chars]`
            : text;
    }

    private async readAsTextWithFallback(filePath: string): Promise<string> {
        const buf = await readFile(filePath);
        if (buf.slice(0, 8192).includes(0)) {
            try { return await this.extractViaStrings(filePath); }
            catch { throw new Error('Binary file not supported. Use txt, pdf, docx, doc, rtf, odt, or code files.'); }
        }
        const text = buf.toString('utf-8');
        return text.length > MAX_FILE_CHARS
            ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated at ${MAX_FILE_CHARS} chars]`
            : text;
    }

    private async extractPdf(filePath: string): Promise<string> {
        const escaped = filePath.replace(/'/g, "'\\''");
        for (const cmd of [
            `pdftotext '${escaped}' -`,
            `textutil -convert txt -stdout '${escaped}'`,
            `pandoc -t plain '${escaped}'`
        ]) {
            try {
                const { stdout } = await execAsync(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
                const text = stdout.trim();
                if (text.length > 0) {
                    return text.length > MAX_FILE_CHARS
                        ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated]` : text;
                }
            } catch { /* try next */ }
        }
        throw new Error('Cannot extract PDF. Install pdftotext (poppler) or pandoc.');
    }

    private async extractDocument(filePath: string): Promise<string> {
        const escaped = filePath.replace(/'/g, "'\\''");
        for (const cmd of [
            `textutil -convert txt -stdout '${escaped}'`,
            `pandoc -t plain '${escaped}'`
        ]) {
            try {
                const { stdout } = await execAsync(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
                const text = stdout.trim();
                if (text.length > 0) {
                    return text.length > MAX_FILE_CHARS
                        ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated]` : text;
                }
            } catch { /* try next */ }
        }
        // DOCX ZIP fallback
        if (filePath.toLowerCase().endsWith('.docx')) {
            try {
                const { stdout } = await execAsync(
                    `unzip -p '${escaped}' word/document.xml | sed -e 's/<[^>]*>//g' -e '/^$/d'`,
                    { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
                );
                const text = stdout.trim();
                if (text.length > 0) {
                    return text.length > MAX_FILE_CHARS
                        ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated]` : text;
                }
            } catch { /* fallback failed */ }
        }
        throw new Error('Cannot extract document. Install textutil (macOS) or pandoc.');
    }

    private async extractViaStrings(filePath: string): Promise<string> {
        const escaped = filePath.replace(/'/g, "'\\''");
        const { stdout } = await execAsync(`strings '${escaped}' | head -5000`, {
            timeout: 15000, maxBuffer: 2 * 1024 * 1024
        });
        const text = stdout.trim();
        if (!text) { throw new Error('No readable text found'); }
        return text.length > MAX_FILE_CHARS
            ? text.slice(0, MAX_FILE_CHARS) + `\n\n[... truncated]` : text;
    }

    // ── Provider Models ────────────────────────────────────────────────────

    private static readonly PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
        claude: [
            { value: 'opus', label: 'Opus' },
            { value: 'sonnet', label: 'Sonnet' },
            { value: 'haiku', label: 'Haiku' },
        ],
        gemini: [
            { value: '2.5-pro', label: '2.5 Pro' },
            { value: '2.5-flash', label: '2.5 Flash' },
        ],
        codex: [
            { value: 'o3', label: 'O3' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'o4-mini', label: 'O4 Mini' },
        ],
    };

    private getProviderModels(): { value: string; label: string }[] {
        return ChatViewProvider.PROVIDER_MODELS[this.selectedProvider]
            || ChatViewProvider.PROVIDER_MODELS.claude;
    }

    // ── System Prompt ───────────────────────────────────────────────────────

    private async buildSystemPrompt(): Promise<string> {
        const context = await gatherFullExtensionContext(this.serviceManager, this.contextDeps);
        const stateText = formatFullContextForPrompt(context);

        return `You are an AI assistant for a tmux and agent orchestration system in VS Code (Tmux Agents extension). You can manage tmux sessions/windows/panes, spawn AI agents, create teams, run pipelines, and more.

## Current System State
${stateText}

## Available Actions
${this.apiCatalog.getCatalogText()}

## Rules
1. Briefly explain what you will do.
2. To execute actions, output a JSON object inside a \`\`\`json code block:
   { "actions": [{ "action": "<name>", "params": { ... } }], "next": "<executor>" }
3. "next" field: "tool" to continue after execution, "user" when done.
4. For server-scoped actions, include a "server" param.
5. NEVER output raw shell commands. Only use structured actions.
6. For multi-step tasks, use "next": "tool" to continue.
7. Actions marked [returns data] will report output in tool results.`;
    }

    // ── Streaming CLI Spawn ─────────────────────────────────────────────────

    private spawnStreaming(
        prompt: string,
        onChunk: (text: string) => void,
        timeoutMs: number = 120_000,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const spawnCfg = this.aiManager
                ? this.aiManager.getSpawnConfig(this.selectedProvider)
                : { command: 'claude', args: ['--print', '-'], env: {}, cwd: undefined, shell: true };

            const args = ['--model', this.selectedModel, ...spawnCfg.args];

            const proc = cp.spawn(spawnCfg.command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...spawnCfg.env },
                cwd: spawnCfg.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
                shell: true,
            });

            this.currentProc = proc;
            let fullOutput = '';
            let stderr = '';
            let timedOut = false;

            const timer = setTimeout(() => {
                timedOut = true;
                proc.kill();
                reject(new Error('Command timed out'));
            }, timeoutMs);

            proc.stdout!.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                fullOutput += text;
                onChunk(text);
            });

            proc.stderr!.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });

            proc.on('close', (code: number | null) => {
                clearTimeout(timer);
                this.currentProc = null;
                if (timedOut) { return; }
                if (this.abortRequested) {
                    reject(new Error('Stopped by user'));
                } else if (code === 0) {
                    resolve(fullOutput);
                } else {
                    reject(new Error(stderr || fullOutput || `Process exited with code ${code}`));
                }
            });

            proc.on('error', (err: Error) => {
                clearTimeout(timer);
                this.currentProc = null;
                reject(err);
            });

            // Absorb EPIPE errors on stdin (process may exit before write completes)
            proc.stdin!.on('error', () => {});

            // Defer writing until the process has actually spawned to prevent SIGPIPE
            proc.on('spawn', () => {
                if (proc.stdin!.writable) {
                    proc.stdin!.write(prompt);
                    proc.stdin!.end();
                }
            });
        });
    }

    // ── Chat Message Handling ────────────────────────────────────────────────

    private async handleUserMessage(userText: string): Promise<void> {
        const itemNames = this.attachedItems.filter(f => f.content).map(f => f.name);
        const displayText = itemNames.length > 0
            ? `${userText}\n[Attached: ${itemNames.join(', ')}]`
            : userText;

        this.postMessage({ type: 'addMessage', role: 'user', text: displayText });
        this.postMessage({ type: 'setLoading', loading: true });
        this.conversationHistory.push({ role: 'user', content: userText });
        this.abortRequested = false;

        try {
            await this.runAgentLoop();
        } catch (e: any) {
            if (this.abortRequested) {
                this.postMessage({ type: 'addMessage', role: 'error', text: 'Stopped by user.' });
            } else {
                const errMsg = e.message?.includes('command not found')
                    ? 'AI CLI not found. Install the appropriate CLI tool.'
                    : `Error: ${e.message?.split('\n')[0] || 'unknown error'}`;
                this.postMessage({ type: 'addMessage', role: 'error', text: errMsg });
            }
        } finally {
            this.abortRequested = false;
            this.currentProc = null;
            this.postMessage({ type: 'setLoading', loading: false });
        }
    }

    private async runAgentLoop(): Promise<void> {
        for (let step = 0; step < MAX_AGENT_STEPS; step++) {
            if (this.abortRequested) { break; }

            const prompt = await this.buildPrompt();

            this.postMessage({ type: 'streamStart' });
            if (step > 0) {
                this.postMessage({ type: 'setLoading', loading: true, step: step + 1 });
            }

            let output: string;
            try {
                output = await this.spawnStreaming(prompt, (chunk) => {
                    this.postMessage({ type: 'streamChunk', text: chunk });
                });
            } catch (e) {
                this.postMessage({ type: 'streamEnd' });
                throw e;
            }

            this.postMessage({ type: 'streamEnd' });

            if (!output.trim()) { break; }
            this.conversationHistory.push({ role: 'assistant', content: output });

            // Check for tool calls
            const parsed = this.apiCatalog.parseResponse(output);
            if (parsed.actions.length === 0 || parsed.next === 'user') {
                break;
            }

            // Execute tool calls
            this.postMessage({ type: 'addMessage', role: 'tool', text: `Executing ${parsed.actions.length} action(s)...` });
            const results = await this.apiCatalog.executeActions(parsed.actions);

            const resultLines: string[] = [];
            let executedCount = 0;
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                const actionName = parsed.actions[i]?.action || 'unknown';
                resultLines.push(`${r.success ? 'OK' : 'ERR'}: [${actionName}] ${r.message}`);
                if (r.success) { executedCount++; }
            }

            const toolText = resultLines.join('\n');
            this.postMessage({ type: 'addMessage', role: 'tool', text: toolText });
            this.conversationHistory.push({ role: 'tool', content: toolText });

            if (executedCount > 0 && this.refreshCallback) { this.refreshCallback(); }
        }
    }

    private async buildPrompt(): Promise<string> {
        const systemPrompt = await this.buildSystemPrompt();
        const parts = [systemPrompt];

        const history = this.conversationHistory.slice(-30);
        if (history.length > 0) {
            parts.push('\n## Conversation');
            for (const entry of history) {
                const label = entry.role === 'user' ? 'User'
                    : entry.role === 'assistant' ? 'Assistant'
                    : 'Tool Results';
                parts.push(`\n### ${label}\n${entry.content}`);
            }
        }

        const fileContext = this.buildFileContext();
        if (fileContext) {
            parts.push(`\n## Attached Files/Folders\n${fileContext}`);
        }

        return parts.join('\n');
    }

    private buildFileContext(): string {
        const parts: string[] = [];
        for (const item of this.attachedItems) {
            if (!item.content) { continue; }
            const label = item.isFolder ? `Folder: ${item.name}` : `File: ${item.name}`;
            parts.push(`--- ${label} ---\n${item.content}\n--- End: ${item.name} ---`);
        }
        return parts.join('\n\n');
    }

    // ── Utilities ───────────────────────────────────────────────────────────

    private postMessage(msg: any): void {
        this.webviewView?.webview.postMessage(msg);
    }

    // ── HTML ─────────────────────────────────────────────────────────────────

    private getHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    display: flex; flex-direction: column; height: 100vh;
}
#toolbar {
    display: flex; align-items: center; padding: 4px 8px; gap: 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
#model-select {
    padding: 2px 4px; border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; font-size: 11px; outline: none; cursor: pointer;
}
#model-select:focus { border-color: var(--vscode-focusBorder); }
#toolbar-label { font-size: 11px; opacity: 0.7; }
#toolbar-spacer { flex: 1; }
#clear-btn {
    padding: 2px 8px; border: none; border-radius: 3px; cursor: pointer;
    background: transparent; color: var(--vscode-foreground);
    font-size: 11px; opacity: 0.7;
}
#clear-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

/* ── Quick Actions Bar ───────────────────────────────────────────────── */
#quick-actions {
    display: flex; padding: 4px 8px; gap: 4px; flex-wrap: wrap;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
}
.quick-btn {
    padding: 2px 8px; border: 1px solid var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1));
    border-radius: 12px; cursor: pointer; font-size: 10px; font-family: inherit;
    background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    transition: background 0.15s, border-color 0.15s; white-space: nowrap;
}
.quick-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1));
    border-color: var(--vscode-focusBorder);
}
.quick-btn:disabled { opacity: 0.3; cursor: default; }

/* ── Messages ────────────────────────────────────────────────────────── */
#messages { flex: 1; overflow-y: auto; padding: 8px; }
.msg {
    margin-bottom: 8px; padding: 6px 8px; border-radius: 4px;
    white-space: pre-wrap; word-break: break-word;
    font-size: 12px; line-height: 1.4;
}
.msg.user { background: var(--vscode-input-background); border-left: 3px solid var(--vscode-focusBorder); }
.msg.assistant { background: var(--vscode-editor-background); border-left: 3px solid var(--vscode-terminal-ansiGreen); }
.msg.tool { background: var(--vscode-editor-background); border-left: 3px solid var(--vscode-terminal-ansiYellow); font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
.msg.error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border-left: 3px solid var(--vscode-errorForeground); }
.msg-label { font-weight: bold; margin-bottom: 2px; font-size: 11px; opacity: 0.7; }

/* ── Tool result lines ───────────────────────────────────────────────── */
.tool-line { padding: 1px 0; }
.tool-line.ok { color: var(--vscode-terminal-ansiGreen); }
.tool-line.err { color: var(--vscode-errorForeground); }
.tool-line .action-name { opacity: 0.7; }

/* ── Suggestion Dropdown ─────────────────────────────────────────────── */
#suggestions {
    display: none; position: absolute; bottom: 100%; left: 0; right: 0;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px; max-height: 180px; overflow-y: auto;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.2); z-index: 10;
    margin-bottom: 2px;
}
#suggestions.visible { display: block; }
.suggestion-item {
    padding: 4px 8px; cursor: pointer; font-size: 11px;
    display: flex; align-items: baseline; gap: 6px;
}
.suggestion-item:hover, .suggestion-item.selected {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
}
.suggestion-item .cmd { font-weight: 600; color: var(--vscode-terminal-ansiCyan); white-space: nowrap; }
.suggestion-item .desc { opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Files Bar ───────────────────────────────────────────────────────── */
#files-bar {
    display: none; padding: 4px 8px; gap: 4px; flex-wrap: wrap;
    border-top: 1px solid var(--vscode-panel-border);
}
#files-bar.has-files { display: flex; }
.file-chip {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 6px; border-radius: 3px; font-size: 11px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    max-width: 200px;
}
.file-chip .icon { flex-shrink: 0; font-size: 12px; }
.file-chip .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-chip .meta { opacity: 0.7; font-size: 10px; flex-shrink: 0; }
.file-chip .remove {
    cursor: pointer; opacity: 0.6; font-size: 13px; line-height: 1;
    flex-shrink: 0; margin-left: 2px;
}
.file-chip .remove:hover { opacity: 1; }

/* ── Input Area ──────────────────────────────────────────────────────── */
#input-area {
    display: flex; padding: 6px 8px; gap: 4px;
    border-top: 1px solid var(--vscode-panel-border);
    align-items: center; position: relative;
}
.import-btn {
    padding: 4px 6px; border: none; border-radius: 3px; cursor: pointer;
    background: transparent; color: var(--vscode-foreground);
    font-size: 13px; opacity: 0.7; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px;
}
.import-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.import-btn:disabled { opacity: 0.3; cursor: default; }
#input {
    flex: 1; padding: 4px 8px; border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; font-size: 12px; outline: none; min-width: 0;
}
#input:focus { border-color: var(--vscode-focusBorder); }
#send {
    padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    font-size: 12px; flex-shrink: 0;
}
#send:hover { background: var(--vscode-button-hoverBackground); }
#send:disabled { opacity: 0.5; cursor: default; }
#stop {
    padding: 4px 10px; border: none; border-radius: 3px; cursor: pointer;
    background: var(--vscode-errorForeground, #f44); color: #fff;
    font-size: 12px; flex-shrink: 0; display: none;
}
#stop:hover { opacity: 0.85; }
#loading { display: none; padding: 8px; text-align: center; opacity: 0.7; font-size: 11px; }

/* ── Voice Input ─────────────────────────────────────────────────────── */
.voice-btn {
    padding: 4px 6px; border: none; border-radius: 3px; cursor: pointer;
    background: transparent; color: var(--vscode-foreground);
    font-size: 13px; opacity: 0.7; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; transition: opacity 0.15s, background 0.15s;
}
.voice-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.voice-btn.recording {
    opacity: 1; color: #f44747;
    animation: voice-pulse 1s ease-in-out infinite;
}
.voice-btn:disabled { opacity: 0.3; cursor: default; }
@keyframes voice-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* ── Provider & Session Status ───────────────────────────────────────── */
#provider-select {
    padding: 2px 4px; border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border-radius: 3px; font-size: 11px; outline: none; cursor: pointer;
}
#provider-select:focus { border-color: var(--vscode-focusBorder); }
/* ── Streaming Message ───────────────────────────────────────────────── */
.msg.streaming { border-left-color: var(--vscode-terminal-ansiCyan); }
.msg.streaming .stream-body::after {
    content: '\\25AE'; display: inline; animation: blink-cursor 0.7s steps(1) infinite;
    color: var(--vscode-terminal-ansiCyan);
}
@keyframes blink-cursor {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
</style>
</head>
<body>
<div id="toolbar">
    <select id="provider-select" title="Select AI provider">
        <option value="claude" selected>Claude</option>
        <option value="gemini">Gemini</option>
        <option value="codex">Codex</option>
    </select>
    <select id="model-select" title="Select AI model for chat responses">
        <option value="sonnet">Sonnet</option>
        <option value="opus" selected>Opus</option>
        <option value="haiku">Haiku</option>
    </select>
    <span id="toolbar-spacer"></span>
    <button id="clear-btn" title="Clear chat history">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12zm3.15-8.85l-1.3-1.3L8 5.71 6.15 3.85l-1.3 1.3L6.71 7 4.85 8.85l1.3 1.3L8 8.29l1.85 1.86 1.3-1.3L9.29 7l1.86-1.85z"/>
        </svg>
    </button>
</div>
<div id="quick-actions">
    <button class="quick-btn" data-prompt="List all servers and their sessions" title="List all servers and their sessions">Servers</button>
    <button class="quick-btn" data-prompt="List all agents and their status" title="List all agents and their status">Agents</button>
    <button class="quick-btn" data-prompt="List all teams" title="List all teams">Teams</button>
    <button class="quick-btn" data-prompt="Show the task queue" title="Show the task queue">Tasks</button>
    <button class="quick-btn" data-prompt="List all pipelines" title="List all pipelines">Pipelines</button>
    <button class="quick-btn" data-prompt="Show the dashboard state" title="Show the dashboard state">Dashboard</button>
    <button class="quick-btn" data-prompt="List all available agent templates" title="List all available agent templates">Templates</button>
    <button class="quick-btn" data-prompt="Open the Kanban board" title="Open the Kanban board">Kanban</button>
    <button class="quick-btn" data-prompt="List all kanban swim lanes" title="List all kanban swim lanes">Swim Lanes</button>
</div>
<div id="messages"></div>
<div id="loading">Thinking...</div>
<div id="files-bar"></div>
<div id="input-area">
    <div id="suggestions"></div>
    <button class="import-btn" id="import-file-btn" title="Import file">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.85 4.44l-3.28-3.3A.5.5 0 0010.21 1H3.5A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V4.8a.5.5 0 00-.15-.36zM10.5 2.12L12.88 4.5H10.5V2.12zM13 13.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5H9.5V5a.5.5 0 00.5.5h3V13.5z"/>
        </svg>
    </button>
    <button class="import-btn" id="import-folder-btn" title="Import folder">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 3H7.71l-.85-.85A.5.5 0 006.5 2h-5a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h13a.5.5 0 00.5-.5v-10a.5.5 0 00-.5-.5zm-.5 10H2V3h4.29l.85.85a.5.5 0 00.36.15H14v9z"/>
        </svg>
    </button>
    <button class="voice-btn" id="voice-btn" title="Voice input (click to record, click again to stop)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 10a2 2 0 0 0 2-2V4a2 2 0 1 0-4 0v4a2 2 0 0 0 2 2z"/>
            <path d="M12 8a1 1 0 0 0-2 0 2 2 0 0 1-4 0 1 1 0 0 0-2 0 4 4 0 0 0 3 3.87V13H5.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1H9v-1.13A4 4 0 0 0 12 8z"/>
        </svg>
    </button>
    <input id="input" placeholder="Ask anything or type / for commands..." title="Type a message or / for slash commands" />
    <button id="send" title="Send message to AI">Send</button>
    <button id="stop" title="Stop generation">Stop</button>
</div>
<script>
var vscode = acquireVsCodeApi();
var messagesEl = document.getElementById('messages');
var inputEl = document.getElementById('input');
var sendBtn = document.getElementById('send');
var stopBtn = document.getElementById('stop');
var importFileBtn = document.getElementById('import-file-btn');
var importFolderBtn = document.getElementById('import-folder-btn');
var loadingEl = document.getElementById('loading');
var filesBar = document.getElementById('files-bar');
var modelSelect = document.getElementById('model-select');
var providerSelect = document.getElementById('provider-select');
var clearBtn = document.getElementById('clear-btn');
var streamingDiv = null;
var suggestionsEl = document.getElementById('suggestions');
var quickActionsEl = document.getElementById('quick-actions');
var selectedSuggestion = -1;

/* ── Slash command suggestions ──────────────────────────────────────── */
var slashCommands = [
    { cmd: '/servers', desc: 'List all servers and sessions', prompt: 'List all servers and their sessions' },
    { cmd: '/agents', desc: 'List all agents with status', prompt: 'List all agents and their current status' },
    { cmd: '/agents idle', desc: 'Show idle agents', prompt: 'List all idle agents available for work' },
    { cmd: '/teams', desc: 'List all teams', prompt: 'List all teams and their members' },
    { cmd: '/tasks', desc: 'Show task queue', prompt: 'Show all tasks in the queue with their status' },
    { cmd: '/pipelines', desc: 'List pipelines', prompt: 'List all pipelines and their stages' },
    { cmd: '/templates', desc: 'List agent templates', prompt: 'List all available agent templates' },
    { cmd: '/dashboard', desc: 'Full dashboard state', prompt: 'Show the complete dashboard state: agents, tasks, teams' },
    { cmd: '/kanban', desc: 'Open Kanban board', prompt: 'Open the Kanban board' },
    { cmd: '/kanban tasks', desc: 'List all kanban tasks', prompt: 'List all kanban tasks with their status, column, auto-mode, and summaries' },
    { cmd: '/kanban auto', desc: 'List auto-mode tasks', prompt: 'List all kanban tasks that have auto-mode enabled' },
    { cmd: '/kanban done', desc: 'Show completed tasks', prompt: 'List all kanban tasks in the done column with their completion summaries' },
    { cmd: '/swim-lanes', desc: 'List swim lanes', prompt: 'List all kanban swim lanes' },
    { cmd: '/graph', desc: 'Open pipeline graph', prompt: 'Open the Pipeline Graph view' },
    { cmd: '/spawn', desc: 'Spawn a new agent', prompt: 'Show me the available templates and help me spawn a new agent' },
    { cmd: '/team coding', desc: 'Quick coding team', prompt: 'Spawn a quick coding team (coder + reviewer + tester)' },
    { cmd: '/team research', desc: 'Quick research team', prompt: 'Spawn a quick research team' },
    { cmd: '/create session', desc: 'Create tmux session', prompt: 'Create a new tmux session' },
    { cmd: '/create task', desc: 'Create kanban task', prompt: 'Help me create a new kanban task. What should the task do?' },
    { cmd: '/create pipeline', desc: 'Create pipeline from description', prompt: 'Help me create a pipeline. What should it do?' },
    { cmd: '/tree', desc: 'Full tmux hierarchy', prompt: 'Show the full tmux tree for all servers' },
    { cmd: '/providers', desc: 'List AI providers', prompt: 'List all supported AI providers and their commands' },
    { cmd: '/builtin', desc: 'Built-in templates & pipelines', prompt: 'Show all built-in agent templates and pipeline templates' },
];

function showSuggestions(filter) {
    var filtered = slashCommands.filter(function(c) {
        return c.cmd.toLowerCase().indexOf(filter.toLowerCase()) === 0;
    });
    if (filtered.length === 0 || filter === '') {
        suggestionsEl.classList.remove('visible');
        selectedSuggestion = -1;
        return;
    }
    suggestionsEl.innerHTML = '';
    filtered.forEach(function(c, i) {
        var item = document.createElement('div');
        item.className = 'suggestion-item' + (i === selectedSuggestion ? ' selected' : '');
        item.innerHTML = '<span class="cmd">' + escapeHtml(c.cmd) + '</span><span class="desc">' + escapeHtml(c.desc) + '</span>';
        item.addEventListener('mousedown', function(e) {
            e.preventDefault();
            inputEl.value = '';
            vscode.postMessage({ type: 'send', text: c.prompt });
            suggestionsEl.classList.remove('visible');
        });
        suggestionsEl.appendChild(item);
    });
    suggestionsEl.classList.add('visible');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
    return (bytes / (1024 * 1024)).toFixed(1) + 'M';
}

function renderFiles(files) {
    filesBar.innerHTML = '';
    if (!files || files.length === 0) {
        filesBar.classList.remove('has-files');
        return;
    }
    filesBar.classList.add('has-files');
    files.forEach(function(f, i) {
        var chip = document.createElement('span');
        chip.className = 'file-chip';
        var icon = f.isFolder ? '&#x1F4C1;' : '&#x1F4C4;';
        var meta = f.isFolder
            ? f.fileCount + ' files'
            : formatSize(f.size);
        chip.innerHTML =
            '<span class="icon">' + icon + '</span>' +
            '<span class="name">' + escapeHtml(f.name) + '</span>' +
            '<span class="meta">' + meta + '</span>' +
            '<span class="remove" data-index="' + i + '">&times;</span>';
        filesBar.appendChild(chip);
    });
}

function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

filesBar.addEventListener('click', function(e) {
    var remove = e.target.closest('.remove');
    if (remove) {
        vscode.postMessage({ type: 'removeFile', index: parseInt(remove.dataset.index, 10) });
    }
});

function addMessage(role, text, label) {
    var div = document.createElement('div');
    div.className = 'msg ' + role;
    var labelEl = document.createElement('div');
    labelEl.className = 'msg-label';
    if (label) {
        labelEl.textContent = role === 'assistant' ? 'AI \\u00B7 Step ' + label.replace('step-', '') : label;
    } else if (role === 'user') {
        labelEl.textContent = 'You';
    } else if (role === 'error') {
        labelEl.textContent = 'Error';
    } else if (role === 'tool') {
        labelEl.textContent = 'Tool Results';
    } else {
        labelEl.textContent = 'AI';
    }
    div.appendChild(labelEl);

    /* Enhanced tool result rendering */
    if (role === 'tool') {
        var body = document.createElement('div');
        var lines = text.split('\\n');
        lines.forEach(function(line) {
            var lineEl = document.createElement('div');
            lineEl.className = 'tool-line';
            if (line.startsWith('OK:')) {
                lineEl.classList.add('ok');
                var actionMatch = line.match(/\\[([^\\]]+)\\]/);
                if (actionMatch) {
                    lineEl.innerHTML = '<span style="color:var(--vscode-terminal-ansiGreen)">OK</span> <span class="action-name">[' + escapeHtml(actionMatch[1]) + ']</span> ' + escapeHtml(line.replace(/^OK:\\s*\\[[^\\]]+\\]\\s*/, ''));
                } else {
                    lineEl.textContent = line;
                }
            } else if (line.startsWith('ERR:')) {
                lineEl.classList.add('err');
                lineEl.textContent = line;
            } else {
                lineEl.textContent = line;
            }
            body.appendChild(lineEl);
        });
        div.appendChild(body);
    } else {
        var body = document.createElement('div');
        body.textContent = text;
        div.appendChild(body);
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function send() {
    var text = inputEl.value.trim();
    if (!text) return;
    suggestionsEl.classList.remove('visible');
    /* Resolve slash commands to prompts */
    if (text.startsWith('/')) {
        var match = slashCommands.find(function(c) { return c.cmd === text.toLowerCase(); });
        if (match) { text = match.prompt; }
    }
    inputEl.value = '';
    vscode.postMessage({ type: 'send', text: text });
}

/* ── Quick action buttons ───────────────────────────────────────────── */
quickActionsEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.quick-btn');
    if (btn && !btn.disabled) {
        vscode.postMessage({ type: 'send', text: btn.dataset.prompt });
    }
});

importFileBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'importFile' });
});
importFolderBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'importFolder' });
});
modelSelect.addEventListener('change', function() {
    vscode.postMessage({ type: 'setModel', model: modelSelect.value });
});
providerSelect.addEventListener('change', function() {
    vscode.postMessage({ type: 'setProvider', provider: providerSelect.value });
});
clearBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'clearHistory' });
});
stopBtn.addEventListener('click', function() {
    vscode.postMessage({ type: 'stop' });
});

/* ── Voice Input ───────────────────────────────────────────────────── */
var voiceBtn = document.getElementById('voice-btn');
var voiceRecording = false;

voiceBtn.addEventListener('click', function() {
    if (voiceRecording) {
        vscode.postMessage({ type: 'stopVoice' });
        voiceBtn.classList.remove('recording');
        voiceBtn.title = 'Voice input (click to record)';
        voiceRecording = false;
    } else {
        vscode.postMessage({ type: 'startVoice' });
    }
});

sendBtn.addEventListener('click', send);

inputEl.addEventListener('input', function() {
    var val = inputEl.value;
    if (val.startsWith('/')) {
        showSuggestions(val);
    } else {
        suggestionsEl.classList.remove('visible');
        selectedSuggestion = -1;
    }
});

inputEl.addEventListener('keydown', function(e) {
    if (suggestionsEl.classList.contains('visible')) {
        var items = suggestionsEl.querySelectorAll('.suggestion-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestion = Math.min(selectedSuggestion + 1, items.length - 1);
            items.forEach(function(el, i) { el.classList.toggle('selected', i === selectedSuggestion); });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestion = Math.max(selectedSuggestion - 1, 0);
            items.forEach(function(el, i) { el.classList.toggle('selected', i === selectedSuggestion); });
            return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && selectedSuggestion >= 0 && items[selectedSuggestion]) {
            e.preventDefault();
            items[selectedSuggestion].dispatchEvent(new MouseEvent('mousedown'));
            return;
        }
        if (e.key === 'Escape') {
            suggestionsEl.classList.remove('visible');
            selectedSuggestion = -1;
            return;
        }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

inputEl.addEventListener('blur', function() {
    setTimeout(function() { suggestionsEl.classList.remove('visible'); }, 150);
});

window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.type === 'addMessage') {
        addMessage(msg.role, msg.text, msg.label);
    } else if (msg.type === 'setLoading') {
        var stepText = msg.step ? 'Thinking (Step ' + msg.step + ')...' : 'Thinking...';
        loadingEl.textContent = stepText;
        loadingEl.style.display = msg.loading ? 'block' : 'none';
        sendBtn.style.display = msg.loading ? 'none' : '';
        stopBtn.style.display = msg.loading ? '' : 'none';
        inputEl.disabled = msg.loading;
        importFileBtn.disabled = msg.loading;
        importFolderBtn.disabled = msg.loading;
        voiceBtn.disabled = msg.loading;
        /* Disable quick action buttons during loading */
        quickActionsEl.querySelectorAll('.quick-btn').forEach(function(btn) { btn.disabled = msg.loading; });
    } else if (msg.type === 'updateFiles') {
        renderFiles(msg.files);
    } else if (msg.type === 'clearMessages') {
        messagesEl.innerHTML = '';
    } else if (msg.type === 'voiceStarted') {
        voiceRecording = true;
        voiceBtn.classList.add('recording');
        voiceBtn.title = 'Recording... click to stop';
        inputEl.placeholder = 'Recording... click mic to stop';
    } else if (msg.type === 'voiceTranscribing') {
        voiceBtn.classList.remove('recording');
        voiceBtn.title = 'Transcribing...';
        voiceBtn.disabled = true;
        inputEl.placeholder = 'Transcribing audio...';
    } else if (msg.type === 'voiceResult') {
        voiceRecording = false;
        voiceBtn.disabled = false;
        voiceBtn.title = 'Voice input (click to record)';
        inputEl.placeholder = 'Ask anything or type / for commands...';
        inputEl.value = msg.text;
        inputEl.focus();
    } else if (msg.type === 'voiceError') {
        voiceRecording = false;
        voiceBtn.classList.remove('recording');
        voiceBtn.disabled = false;
        voiceBtn.title = 'Voice input (click to record)';
        inputEl.placeholder = 'Ask anything or type / for commands...';
        addMessage('error', msg.text);
    } else if (msg.type === 'streamStart') {
        /* Create a streaming message div */
        streamingDiv = document.createElement('div');
        streamingDiv.className = 'msg assistant streaming';
        var lbl = document.createElement('div');
        lbl.className = 'msg-label';
        lbl.textContent = 'AI';
        streamingDiv.appendChild(lbl);
        var body = document.createElement('div');
        body.className = 'stream-body';
        streamingDiv.appendChild(body);
        messagesEl.appendChild(streamingDiv);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (msg.type === 'streamChunk') {
        if (streamingDiv) {
            var body = streamingDiv.querySelector('.stream-body');
            if (body) {
                body.textContent += msg.text;
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
        }
    } else if (msg.type === 'streamEnd') {
        if (streamingDiv) {
            streamingDiv.classList.remove('streaming');
            streamingDiv = null;
        }
    } else if (msg.type === 'updateModels') {
        modelSelect.innerHTML = '';
        msg.models.forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            if (msg.selected && m.value === msg.selected) { opt.selected = true; }
            modelSelect.appendChild(opt);
        });
    }
});
</script>
</body>
</html>`;
    }
}

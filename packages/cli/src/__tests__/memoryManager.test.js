"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const memoryManager_1 = require("../core/memoryManager");
// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeLane = (overrides = {}) => ({
    id: 'lane-1',
    name: 'Test Lane',
    serverId: 'local',
    workingDirectory: '/home/user/project',
    sessionName: 'test-lane',
    createdAt: Date.now(),
    memoryFileId: 'abc-123-def',
    ...overrides,
});
const mockService = () => ({
    execCommand: vitest_1.vi.fn().mockResolvedValue(''),
});
// ─── Path Resolution ────────────────────────────────────────────────────────
(0, vitest_1.describe)('getMemoryFilePath', () => {
    (0, vitest_1.it)('returns default path based on workingDirectory', () => {
        const lane = makeLane();
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryFilePath)(lane)).toBe('/home/user/project/memory/abc-123-def.md');
    });
    (0, vitest_1.it)('uses custom memoryPath when set', () => {
        const lane = makeLane({ memoryPath: '/shared/memory' });
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryFilePath)(lane)).toBe('/shared/memory/abc-123-def.md');
    });
    (0, vitest_1.it)('returns undefined when memoryFileId is missing', () => {
        const lane = makeLane({ memoryFileId: undefined });
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryFilePath)(lane)).toBeUndefined();
    });
});
(0, vitest_1.describe)('getMemoryDir', () => {
    (0, vitest_1.it)('returns default dir based on workingDirectory', () => {
        const lane = makeLane();
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryDir)(lane)).toBe('/home/user/project/memory');
    });
    (0, vitest_1.it)('uses custom memoryPath when set', () => {
        const lane = makeLane({ memoryPath: '/shared/memory' });
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryDir)(lane)).toBe('/shared/memory');
    });
    (0, vitest_1.it)('returns undefined when memoryFileId is missing', () => {
        const lane = makeLane({ memoryFileId: undefined });
        (0, vitest_1.expect)((0, memoryManager_1.getMemoryDir)(lane)).toBeUndefined();
    });
});
// ─── File I/O ───────────────────────────────────────────────────────────────
(0, vitest_1.describe)('ensureMemoryDir', () => {
    (0, vitest_1.it)('calls mkdir -p with the memory dir', async () => {
        const service = mockService();
        const lane = makeLane();
        await (0, memoryManager_1.ensureMemoryDir)(service, lane);
        (0, vitest_1.expect)(service.execCommand).toHaveBeenCalledWith('mkdir -p "/home/user/project/memory"');
    });
    (0, vitest_1.it)('does nothing when memoryFileId is missing', async () => {
        const service = mockService();
        const lane = makeLane({ memoryFileId: undefined });
        await (0, memoryManager_1.ensureMemoryDir)(service, lane);
        (0, vitest_1.expect)(service.execCommand).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('readMemoryFile', () => {
    (0, vitest_1.it)('returns file content via cat', async () => {
        const service = mockService();
        service.execCommand.mockResolvedValue('# Memory\nSome content\n');
        const lane = makeLane();
        const result = await (0, memoryManager_1.readMemoryFile)(service, lane);
        (0, vitest_1.expect)(result).toBe('# Memory\nSome content');
        (0, vitest_1.expect)(service.execCommand).toHaveBeenCalledWith('cat "/home/user/project/memory/abc-123-def.md" 2>/dev/null || true');
    });
    (0, vitest_1.it)('returns empty string when file does not exist', async () => {
        const service = mockService();
        service.execCommand.mockResolvedValue('');
        const lane = makeLane();
        const result = await (0, memoryManager_1.readMemoryFile)(service, lane);
        (0, vitest_1.expect)(result).toBe('');
    });
    (0, vitest_1.it)('returns empty string when memoryFileId is missing', async () => {
        const service = mockService();
        const lane = makeLane({ memoryFileId: undefined });
        const result = await (0, memoryManager_1.readMemoryFile)(service, lane);
        (0, vitest_1.expect)(result).toBe('');
        (0, vitest_1.expect)(service.execCommand).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns empty string on exec error', async () => {
        const service = mockService();
        service.execCommand.mockRejectedValue(new Error('SSH failed'));
        const lane = makeLane();
        const result = await (0, memoryManager_1.readMemoryFile)(service, lane);
        (0, vitest_1.expect)(result).toBe('');
    });
});
// ─── Prompt Building ────────────────────────────────────────────────────────
(0, vitest_1.describe)('buildMemoryLoadPrompt', () => {
    (0, vitest_1.it)('includes memory content when present', () => {
        const result = (0, memoryManager_1.buildMemoryLoadPrompt)('# Previous work\nDid stuff', '/proj/memory/abc.md');
        (0, vitest_1.expect)(result).toContain('Long-Term Memory');
        (0, vitest_1.expect)(result).toContain('Memory file: /proj/memory/abc.md');
        (0, vitest_1.expect)(result).toContain('# Previous work');
        (0, vitest_1.expect)(result).toContain('Did stuff');
        (0, vitest_1.expect)(result).toContain('accumulated memory from previous tasks');
    });
    (0, vitest_1.it)('indicates first task when content is empty', () => {
        const result = (0, memoryManager_1.buildMemoryLoadPrompt)('', '/proj/memory/abc.md');
        (0, vitest_1.expect)(result).toContain('No previous memory exists yet');
        (0, vitest_1.expect)(result).toContain('first task in this lane');
        (0, vitest_1.expect)(result).not.toContain('accumulated memory');
    });
    (0, vitest_1.it)('includes file path in both cases', () => {
        const withContent = (0, memoryManager_1.buildMemoryLoadPrompt)('stuff', '/a/b.md');
        const withoutContent = (0, memoryManager_1.buildMemoryLoadPrompt)('', '/a/b.md');
        (0, vitest_1.expect)(withContent).toContain('Memory file: /a/b.md');
        (0, vitest_1.expect)(withoutContent).toContain('Memory file: /a/b.md');
    });
});
(0, vitest_1.describe)('buildMemorySavePrompt', () => {
    (0, vitest_1.it)('includes the file path', () => {
        const result = (0, memoryManager_1.buildMemorySavePrompt)('/proj/memory/abc.md');
        (0, vitest_1.expect)(result).toContain('/proj/memory/abc.md');
    });
    (0, vitest_1.it)('includes required sections', () => {
        const result = (0, memoryManager_1.buildMemorySavePrompt)('/path.md');
        (0, vitest_1.expect)(result).toContain('Essential changes');
        (0, vitest_1.expect)(result).toContain('Major updates');
        (0, vitest_1.expect)(result).toContain('Current state');
        (0, vitest_1.expect)(result).toContain('Log locations');
        (0, vitest_1.expect)(result).toContain('Conventions');
    });
    (0, vitest_1.it)('mentions 200 line limit', () => {
        const result = (0, memoryManager_1.buildMemorySavePrompt)('/path.md');
        (0, vitest_1.expect)(result).toContain('200 lines');
    });
    (0, vitest_1.it)('instructs to overwrite outdated info', () => {
        const result = (0, memoryManager_1.buildMemorySavePrompt)('/path.md');
        (0, vitest_1.expect)(result).toContain('Overwrite outdated information');
    });
});
//# sourceMappingURL=memoryManager.test.js.map
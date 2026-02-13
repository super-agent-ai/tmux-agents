import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KanbanSwimLane } from '../types';
import {
    getMemoryFilePath,
    getMemoryDir,
    ensureMemoryDir,
    readMemoryFile,
    buildMemoryLoadPrompt,
    buildMemorySavePrompt,
} from '../memoryManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeLane = (overrides: Partial<KanbanSwimLane> = {}): KanbanSwimLane => ({
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
    execCommand: vi.fn().mockResolvedValue(''),
} as any);

// ─── Path Resolution ────────────────────────────────────────────────────────

describe('getMemoryFilePath', () => {
    it('returns default path based on workingDirectory', () => {
        const lane = makeLane();
        expect(getMemoryFilePath(lane)).toBe('/home/user/project/memory/abc-123-def.md');
    });

    it('uses custom memoryPath when set', () => {
        const lane = makeLane({ memoryPath: '/shared/memory' });
        expect(getMemoryFilePath(lane)).toBe('/shared/memory/abc-123-def.md');
    });

    it('returns undefined when memoryFileId is missing', () => {
        const lane = makeLane({ memoryFileId: undefined });
        expect(getMemoryFilePath(lane)).toBeUndefined();
    });
});

describe('getMemoryDir', () => {
    it('returns default dir based on workingDirectory', () => {
        const lane = makeLane();
        expect(getMemoryDir(lane)).toBe('/home/user/project/memory');
    });

    it('uses custom memoryPath when set', () => {
        const lane = makeLane({ memoryPath: '/shared/memory' });
        expect(getMemoryDir(lane)).toBe('/shared/memory');
    });

    it('returns undefined when memoryFileId is missing', () => {
        const lane = makeLane({ memoryFileId: undefined });
        expect(getMemoryDir(lane)).toBeUndefined();
    });
});

// ─── File I/O ───────────────────────────────────────────────────────────────

describe('ensureMemoryDir', () => {
    it('calls mkdir -p with the memory dir', async () => {
        const service = mockService();
        const lane = makeLane();
        await ensureMemoryDir(service, lane);
        expect(service.execCommand).toHaveBeenCalledWith('mkdir -p "/home/user/project/memory"');
    });

    it('does nothing when memoryFileId is missing', async () => {
        const service = mockService();
        const lane = makeLane({ memoryFileId: undefined });
        await ensureMemoryDir(service, lane);
        expect(service.execCommand).not.toHaveBeenCalled();
    });
});

describe('readMemoryFile', () => {
    it('returns file content via cat', async () => {
        const service = mockService();
        service.execCommand.mockResolvedValue('# Memory\nSome content\n');
        const lane = makeLane();
        const result = await readMemoryFile(service, lane);
        expect(result).toBe('# Memory\nSome content');
        expect(service.execCommand).toHaveBeenCalledWith(
            'cat "/home/user/project/memory/abc-123-def.md" 2>/dev/null || true'
        );
    });

    it('returns empty string when file does not exist', async () => {
        const service = mockService();
        service.execCommand.mockResolvedValue('');
        const lane = makeLane();
        const result = await readMemoryFile(service, lane);
        expect(result).toBe('');
    });

    it('returns empty string when memoryFileId is missing', async () => {
        const service = mockService();
        const lane = makeLane({ memoryFileId: undefined });
        const result = await readMemoryFile(service, lane);
        expect(result).toBe('');
        expect(service.execCommand).not.toHaveBeenCalled();
    });

    it('returns empty string on exec error', async () => {
        const service = mockService();
        service.execCommand.mockRejectedValue(new Error('SSH failed'));
        const lane = makeLane();
        const result = await readMemoryFile(service, lane);
        expect(result).toBe('');
    });
});

// ─── Prompt Building ────────────────────────────────────────────────────────

describe('buildMemoryLoadPrompt', () => {
    it('includes memory content when present', () => {
        const result = buildMemoryLoadPrompt('# Previous work\nDid stuff', '/proj/memory/abc.md');
        expect(result).toContain('Long-Term Memory');
        expect(result).toContain('Memory file: /proj/memory/abc.md');
        expect(result).toContain('# Previous work');
        expect(result).toContain('Did stuff');
        expect(result).toContain('accumulated memory from previous tasks');
    });

    it('indicates first task when content is empty', () => {
        const result = buildMemoryLoadPrompt('', '/proj/memory/abc.md');
        expect(result).toContain('No previous memory exists yet');
        expect(result).toContain('first task in this lane');
        expect(result).not.toContain('accumulated memory');
    });

    it('includes file path in both cases', () => {
        const withContent = buildMemoryLoadPrompt('stuff', '/a/b.md');
        const withoutContent = buildMemoryLoadPrompt('', '/a/b.md');
        expect(withContent).toContain('Memory file: /a/b.md');
        expect(withoutContent).toContain('Memory file: /a/b.md');
    });
});

describe('buildMemorySavePrompt', () => {
    it('includes the file path', () => {
        const result = buildMemorySavePrompt('/proj/memory/abc.md');
        expect(result).toContain('/proj/memory/abc.md');
    });

    it('includes required sections', () => {
        const result = buildMemorySavePrompt('/path.md');
        expect(result).toContain('Essential changes');
        expect(result).toContain('Major updates');
        expect(result).toContain('Current state');
        expect(result).toContain('Log locations');
        expect(result).toContain('Conventions');
    });

    it('mentions 200 line limit', () => {
        const result = buildMemorySavePrompt('/path.md');
        expect(result).toContain('200 lines');
    });

    it('instructs to overwrite outdated info', () => {
        const result = buildMemorySavePrompt('/path.md');
        expect(result).toContain('Overwrite outdated information');
    });
});

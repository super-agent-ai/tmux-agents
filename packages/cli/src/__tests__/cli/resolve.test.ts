import { describe, it, expect } from 'vitest';
import { resolveId } from '../../cli/util/resolve';

describe('ID Resolver', () => {
    const items = [
        { id: 'a1b2c3d4' },
        { id: 'a1b2e5f6' },
        { id: 'b7c8d9e0' }
    ];

    it('should resolve exact match', () => {
        const result = resolveId(items, 'a1b2c3d4');
        expect(result).toBe('a1b2c3d4');
    });

    it('should resolve unique prefix', () => {
        const result = resolveId(items, 'b7');
        expect(result).toBe('b7c8d9e0');
    });

    it('should throw on ambiguous prefix', () => {
        expect(() => resolveId(items, 'a1b2')).toThrow('Ambiguous');
    });

    it('should throw on no match', () => {
        expect(() => resolveId(items, 'z9')).toThrow('No match');
    });

    it('should handle empty list', () => {
        expect(() => resolveId([], 'a1')).toThrow('No match');
    });
});

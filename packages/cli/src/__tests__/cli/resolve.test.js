"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const resolve_1 = require("../../cli/util/resolve");
(0, vitest_1.describe)('ID Resolver', () => {
    const items = [
        { id: 'a1b2c3d4' },
        { id: 'a1b2e5f6' },
        { id: 'b7c8d9e0' }
    ];
    (0, vitest_1.it)('should resolve exact match', () => {
        const result = (0, resolve_1.resolveId)(items, 'a1b2c3d4');
        (0, vitest_1.expect)(result).toBe('a1b2c3d4');
    });
    (0, vitest_1.it)('should resolve unique prefix', () => {
        const result = (0, resolve_1.resolveId)(items, 'b7');
        (0, vitest_1.expect)(result).toBe('b7c8d9e0');
    });
    (0, vitest_1.it)('should throw on ambiguous prefix', () => {
        (0, vitest_1.expect)(() => (0, resolve_1.resolveId)(items, 'a1b2')).toThrow('Ambiguous');
    });
    (0, vitest_1.it)('should throw on no match', () => {
        (0, vitest_1.expect)(() => (0, resolve_1.resolveId)(items, 'z9')).toThrow('No match');
    });
    (0, vitest_1.it)('should handle empty list', () => {
        (0, vitest_1.expect)(() => (0, resolve_1.resolveId)([], 'a1')).toThrow('No match');
    });
});
//# sourceMappingURL=resolve.test.js.map
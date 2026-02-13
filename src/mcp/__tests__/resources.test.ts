import { describe, it, expect } from 'vitest';
import { resources } from '../resources';

describe('MCP Resources', () => {
    it('defines exactly 4 resources', () => {
        expect(resources).toHaveLength(4);
    });

    it('all resources have required fields', () => {
        resources.forEach(resource => {
            expect(resource).toHaveProperty('uri');
            expect(resource).toHaveProperty('name');
            expect(resource).toHaveProperty('description');
            expect(resource).toHaveProperty('mimeType');
            expect(typeof resource.uri).toBe('string');
            expect(typeof resource.name).toBe('string');
            expect(typeof resource.description).toBe('string');
            expect(typeof resource.mimeType).toBe('string');
        });
    });

    it('all resource URIs use tmux-agents scheme', () => {
        resources.forEach(resource => {
            expect(resource.uri).toMatch(/^tmux-agents:\/\//);
        });
    });

    it('all resource URIs are unique', () => {
        const uris = resources.map(r => r.uri);
        const uniqueUris = new Set(uris);
        expect(uniqueUris.size).toBe(resources.length);
    });

    describe('health resource', () => {
        const resource = resources.find(r => r.uri === 'tmux-agents://health');

        it('exists', () => {
            expect(resource).toBeDefined();
        });

        it('has text/plain mime type', () => {
            expect(resource?.mimeType).toBe('text/plain');
        });
    });

    describe('agents resource', () => {
        const resource = resources.find(r => r.uri === 'tmux-agents://agents');

        it('exists', () => {
            expect(resource).toBeDefined();
        });

        it('has application/json mime type', () => {
            expect(resource?.mimeType).toBe('application/json');
        });
    });

    describe('board resource', () => {
        const resource = resources.find(r => r.uri === 'tmux-agents://board');

        it('exists', () => {
            expect(resource).toBeDefined();
        });

        it('has application/json mime type', () => {
            expect(resource?.mimeType).toBe('application/json');
        });
    });

    describe('pipelines resource', () => {
        const resource = resources.find(r => r.uri === 'tmux-agents://pipelines/active');

        it('exists', () => {
            expect(resource).toBeDefined();
        });

        it('has application/json mime type', () => {
            expect(resource?.mimeType).toBe('application/json');
        });
    });
});

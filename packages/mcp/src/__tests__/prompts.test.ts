import { describe, it, expect } from 'vitest';
import { prompts } from '../prompts';

describe('MCP Prompts', () => {
    it('defines exactly 3 prompts', () => {
        expect(prompts).toHaveLength(3);
    });

    it('all prompts have required fields', () => {
        prompts.forEach(prompt => {
            expect(prompt).toHaveProperty('name');
            expect(prompt).toHaveProperty('description');
            expect(prompt).toHaveProperty('arguments');
            expect(typeof prompt.name).toBe('string');
            expect(typeof prompt.description).toBe('string');
            expect(Array.isArray(prompt.arguments)).toBe(true);
        });
    });

    it('all prompt names are unique', () => {
        const names = prompts.map(p => p.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(prompts.length);
    });

    it('all prompts have meaningful descriptions', () => {
        prompts.forEach(prompt => {
            expect(prompt.description.length).toBeGreaterThan(20);
        });
    });

    describe('orchestrate prompt', () => {
        const prompt = prompts.find(p => p.name === 'orchestrate');

        it('exists', () => {
            expect(prompt).toBeDefined();
        });

        it('requires project argument', () => {
            expect(prompt?.arguments).toHaveLength(1);
            expect(prompt?.arguments[0].name).toBe('project');
            expect(prompt?.arguments[0].required).toBe(true);
        });

        it('has helpful description', () => {
            expect(prompt?.description).toContain('team');
        });
    });

    describe('review_progress prompt', () => {
        const prompt = prompts.find(p => p.name === 'review_progress');

        it('exists', () => {
            expect(prompt).toBeDefined();
        });

        it('has no required arguments', () => {
            expect(prompt?.arguments).toHaveLength(0);
        });

        it('has helpful description', () => {
            expect(prompt?.description).toContain('progress');
        });
    });

    describe('debug_stuck_agent prompt', () => {
        const prompt = prompts.find(p => p.name === 'debug_stuck_agent');

        it('exists', () => {
            expect(prompt).toBeDefined();
        });

        it('requires agent_id argument', () => {
            expect(prompt?.arguments).toHaveLength(1);
            expect(prompt?.arguments[0].name).toBe('agent_id');
            expect(prompt?.arguments[0].required).toBe(true);
        });

        it('has helpful description', () => {
            expect(prompt?.description.toLowerCase()).toContain('debug');
        });
    });
});

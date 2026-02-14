#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { DaemonClient } from './client/daemonClient.js';
import { tools, handleTool } from './tools.js';
import { resources, handleResource } from './resources.js';
import { prompts, handlePrompt } from './prompts.js';

// ─── MCP Server ────────────────────────────────────────────────────────────

class TmuxAgentsMcpServer {
    private server: Server;
    private client: DaemonClient | null = null;

    constructor() {
        this.server = new Server(
            {
                name: 'tmux-agents',
                version: '0.1.19'
            },
            {
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                }
            }
        );

        this.setupHandlers();
    }

    private setupHandlers(): void {
        // List tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }))
        }));

        // Call tool
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const client = await this.getClient();
            const result = await handleTool(request.params.name, request.params.arguments || {}, client);

            return {
                content: [
                    {
                        type: 'text',
                        text: result
                    }
                ]
            };
        });

        // List resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: resources.map(resource => ({
                uri: resource.uri,
                name: resource.name,
                description: resource.description,
                mimeType: resource.mimeType
            }))
        }));

        // Read resource
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const client = await this.getClient();
            const result = await handleResource(request.params.uri, client);

            return {
                contents: [
                    {
                        uri: request.params.uri,
                        mimeType: result.mimeType,
                        text: result.contents
                    }
                ]
            };
        });

        // List prompts
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
            prompts: prompts.map(prompt => ({
                name: prompt.name,
                description: prompt.description,
                arguments: prompt.arguments
            }))
        }));

        // Get prompt
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const client = await this.getClient();
            const result = await handlePrompt(request.params.name, request.params.arguments || {}, client);

            return result;
        });
    }

    private async getClient(): Promise<DaemonClient> {
        if (!this.client) {
            this.client = new DaemonClient();

            try {
                await this.client.connect();
            } catch (error) {
                console.error('Failed to connect to daemon:', error);
                throw new Error(
                    'tmux-agents daemon is not running. Start it with: tmux-agents daemon start'
                );
            }
        }

        return this.client;
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        console.error('tmux-agents MCP server running on stdio');
    }

    async shutdown(): Promise<void> {
        if (this.client) {
            this.client.disconnect();
        }
        await this.server.close();
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────

const server = new TmuxAgentsMcpServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.error('\nShutting down...');
    await server.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.error('\nShutting down...');
    await server.shutdown();
    process.exit(0);
});

// Start server
server.run().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});

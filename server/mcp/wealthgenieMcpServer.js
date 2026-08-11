import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import parseJoi from 'joi-to-json';
import { FinancialToolRegistry } from '../services/financialToolRegistry.js';

/**
 * WealthGenie MCP Server
 * Wraps canonical FinancialToolRegistry as a standardized Model Context Protocol (MCP) server.
 * Single source of truth for all tools derived dynamically from Joi schemas.
 */
export class WealthGenieMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: 'WealthGenie Financial Tools Server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.sseTransports = new Map();
    this.setupHandlers();
  }

  /**
   * Converts a tool's Joi schema into a standard JSON Schema object.
   */
  static convertJoiToJsonSchema(joiSchema) {
    const jsonSchema = parseJoi(joiSchema) || {};
    if (!jsonSchema.type) {
      jsonSchema.type = 'object';
    }
    if (!jsonSchema.properties) {
      jsonSchema.properties = {};
    }
    delete jsonSchema.$schema;
    return jsonSchema;
  }

  /**
   * Returns standard MCP/OpenAI-compatible tool definitions for LLM provider function declaration.
   */
  static getToolDefinitions() {
    const tools = FinancialToolRegistry.listTools();
    return tools.map(toolMeta => {
      const tool = FinancialToolRegistry.getTool(toolMeta.name);
      const jsonSchema = WealthGenieMcpServer.convertJoiToJsonSchema(tool.schema);
      return {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
      };
    });
  }

  /**
   * Sets up ListTools and CallTool MCP protocol handlers.
   */
  setupHandlers() {
    // List tools request handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const definitions = WealthGenieMcpServer.getToolDefinitions();
      const mcpTools = definitions.map(def => ({
        name: def.name,
        description: def.description,
        inputSchema: def.parameters,
      }));
      return { tools: mcpTools };
    });

    // Call tool request handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await FinancialToolRegistry.executeTool(name, args || {});
      if (!result.success) {
        return {
          isError: true,
          content: [{ type: 'text', text: result.error || `Execution failed for '${name}'` }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result.result) }],
      };
    });
  }

  /**
   * Directly executes a tool through FinancialToolRegistry.
   */
  static async executeTool(name, args = {}, context = {}) {
    return FinancialToolRegistry.executeTool(name, args, context);
  }

  /**
   * Connects the server to Stdio transport for local CLI / Claude Desktop connections.
   */
  async connectStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[WealthGenieMcpServer] MCP Server connected via stdio transport.');
  }

  /**
   * Handles incoming SSE connection for HTTP transport.
   */
  async handleSseConnection(req, res) {
    const transport = new SSEServerTransport('/api/mcp/messages', res);
    const sessionId = transport.sessionId;
    this.sseTransports.set(sessionId, transport);

    transport.onclose = () => {
      this.sseTransports.delete(sessionId);
    };

    await this.server.connect(transport);
  }

  /**
   * Handles incoming SSE messages endpoint for HTTP transport.
   */
  async handleSseMessage(req, res) {
    const sessionId = req.query.sessionId;
    const transport = this.sseTransports.get(sessionId);
    if (!transport) {
      return res.status(400).json({ error: `Active SSE session '${sessionId}' not found.` });
    }
    await transport.handlePostMessage(req, res);
  }
}

export const mcpServerInstance = new WealthGenieMcpServer();

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('wealthgenieMcpServer.js')) {
  mcpServerInstance.connectStdio().catch(err => {
    console.error('[WealthGenieMcpServer] Failed to connect stdio transport:', err);
    process.exit(1);
  });
}

import express from 'express';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { mcpServerInstance } from '../mcp/wealthgenieMcpServer.js';

const router = express.Router();

/**
 * GET /api/mcp/sse
 * Establishes an SSE stream for MCP transport. Protected by JWT authentication.
 */
router.get('/sse', verifyJWT, (req, res) => {
  mcpServerInstance.handleSseConnection(req, res);
});

/**
 * POST /api/mcp/messages
 * Message endpoint for active MCP SSE session. Protected by JWT authentication.
 */
router.post('/messages', verifyJWT, (req, res) => {
  mcpServerInstance.handleSseMessage(req, res);
});

export default router;

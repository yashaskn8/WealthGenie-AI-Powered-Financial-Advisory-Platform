# WealthGenie Model Context Protocol (MCP) Integration Guide

This guide documents how to connect external MCP-compatible AI clients (such as **Claude Desktop**, custom subagents, or third-party advisory platforms) to the **WealthGenie MCP Financial Server**.

---

## 1. Architectural Overview

The WealthGenie MCP Server wraps canonical, deterministic backend engines (`FinancialToolRegistry`) as a standardized MCP server. 

- **Single Source of Truth**: All tool names, descriptions, and JSON Schemas are dynamically derived on startup directly from the Joi schemas defined in `server/services/financialToolRegistry.js`.
- **Transports Supported**:
  1. **Stdio Transport**: For local CLI tools and desktop apps (e.g. Claude Desktop).
  2. **Authenticated HTTP/SSE Transport**: For remote client connections over `/api/mcp/sse` and `/api/mcp/messages`.

---

## 2. Registered Tools (7 Canonical Engines)

| Tool Name | Version | Description | Target Use Case |
| :--- | :--- | :--- | :--- |
| `sip_projection` | `2.0.0` | Calculates Future Value of a Systematic Investment Plan (SIP) using annuity-due monthly compounding. | SIP compounding projections |
| `lump_sum_projection` | `2.0.0` | Calculates Future Value of a one-time lump sum investment using compound interest. | One-time investment growth |
| `reverse_sip` | `2.0.0` | Calculates required monthly SIP to achieve a target financial goal. | Goal planning / Target corpus |
| `tax_calculator` | `2.0.0` | Computes income tax liability under Indian tax slabs (FY 2025-26) with Old vs. New Regime comparisons. | Tax optimization & slabs |
| `xirr_calculator` | `2.0.0` | Calculates Exact Internal Rate of Return (XIRR) for irregular cash flows. | Mutual fund & cashflow CAGR |
| `portfolio_optimizer` | `2.0.0` | Optimizes asset weights for minimum variance, maximum Sharpe ratio, or risk parity. | Asset allocation strategy |
| `rebalance_calculator` | `2.0.0` | Computes portfolio drift and rebalance buy/sell directives for a given target allocation. | Portfolio drift & rebalancing |

---

## 3. Claude Desktop Configuration (Local Stdio)

To connect **Claude Desktop** to WealthGenie tools locally:

1. Open your Claude Desktop configuration file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add `wealthgenie-mcp` to your `mcpServers` section:

```json
{
  "mcpServers": {
    "wealthgenie-mcp": {
      "command": "node",
      "args": [
        "C:/Users/prana/OneDrive/Desktop/final wealthgenie/server/mcp/wealthgenieMcpServer.js"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

3. Restart Claude Desktop. You will see the 7 WealthGenie financial tools available in Claude's tool picker.

---

## 4. Remote HTTP/SSE Configuration (Authenticated)

For web apps, mobile apps, or remote agents connecting to WealthGenie over HTTPS:

### Step 1: Establish SSE Connection
Send an authenticated HTTP GET request with a valid JWT Bearer token:

```http
GET /api/mcp/sse HTTP/1.1
Host: api.wealthgenie.in
Authorization: Bearer <YOUR_JWT_TOKEN>
Accept: text/event-stream
```

The server responds with an SSE connection stream and emits a `endpoint` event containing the session ID and message target:

```event-stream
event: endpoint
data: /api/mcp/messages?sessionId=sse_session_987654321
```

### Step 2: Call Tools via SSE Messages Endpoint

Send an authenticated HTTP POST request containing standard MCP JSON-RPC payload:

```http
POST /api/mcp/messages?sessionId=sse_session_987654321 HTTP/1.1
Host: api.wealthgenie.in
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "sip_projection",
    "arguments": {
      "monthlyInvestment": 15000,
      "annualRate": 0.12,
      "years": 15
    }
  }
}
```

### Sample Response Output

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"monthlyInvestment\":15000,\"annualRatePct\":12,\"years\":15,\"totalInvested\":2700000,\"futureValue\":7500918,\"totalReturns\":4800918}"
      }
    ]
  }
}
```

---

## 5. End-to-End Grounding Verification

When the WealthGenie Chat Engine receives a financial question requiring computation:
1. **Pass 1**: The LLM emits a native function call (e.g. `sip_projection`).
2. **Execution**: WealthGenie executes the tool against `FinancialToolRegistry`.
3. **Pass 2**: The tool output is appended to context, and the LLM produces the final user-facing text using the exact computed numbers (`₹75,00,918`).

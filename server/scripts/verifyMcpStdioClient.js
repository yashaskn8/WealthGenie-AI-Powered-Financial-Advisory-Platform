import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, '../mcp/wealthgenieMcpServer.js');

async function runStdioVerification() {
  console.log('================================================================');
  console.log('REAL MCP CLIENT (stdio) CONNECTIVITY VERIFICATION');
  console.log('Target Server:', serverPath);
  console.log('================================================================\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: process.env,
  });

  const client = new Client(
    { name: 'wealthgenie-verification-client', version: '1.0.0' },
    { capabilities: {} }
  );

  console.log('[Client] Connecting to WealthGenie MCP Server via StdioClientTransport...');
  await client.connect(transport);
  console.log('[Client] Connected successfully over stdio!\n');

  // Task 1.4: Call tools/list
  console.log('----------------------------------------------------------------');
  console.log('REQUEST 1: tools/list');
  console.log('----------------------------------------------------------------');
  const toolsListResponse = await client.listTools();
  console.log(JSON.stringify(toolsListResponse, null, 2));
  console.log(`\n[ListTools Check] Received ${toolsListResponse.tools?.length} tools.\n`);

  // Task 1.5: Call tools/call for 3 different tools
  
  // Tool 1: sip_projection
  console.log('----------------------------------------------------------------');
  console.log('REQUEST 2: tools/call -> sip_projection');
  console.log('----------------------------------------------------------------');
  const sipArgs = { monthlyInvestment: 25000, annualRate: 0.12, years: 15 };
  console.log('Arguments:', JSON.stringify(sipArgs));
  const sipResponse = await client.callTool({
    name: 'sip_projection',
    arguments: sipArgs,
  });
  console.log('RAW JSON RESPONSE:');
  console.log(JSON.stringify(sipResponse, null, 2));
  console.log('\n');

  // Tool 2: tax_calculator
  console.log('----------------------------------------------------------------');
  console.log('REQUEST 3: tools/call -> tax_calculator');
  console.log('----------------------------------------------------------------');
  const taxArgs = { income: 1800000, regime: 'new' };
  console.log('Arguments:', JSON.stringify(taxArgs));
  const taxResponse = await client.callTool({
    name: 'tax_calculator',
    arguments: taxArgs,
  });
  console.log('RAW JSON RESPONSE:');
  console.log(JSON.stringify(taxResponse, null, 2));
  console.log('\n');

  // Tool 3: portfolio_optimizer
  console.log('----------------------------------------------------------------');
  console.log('REQUEST 4: tools/call -> portfolio_optimizer');
  console.log('----------------------------------------------------------------');
  const portArgs = { strategy: 'max_sharpe', assets: ['Equity_MF', 'Debt_MF', 'Gold', 'ELSS'] };
  console.log('Arguments:', JSON.stringify(portArgs));
  const portResponse = await client.callTool({
    name: 'portfolio_optimizer',
    arguments: portArgs,
  });
  console.log('RAW JSON RESPONSE:');
  console.log(JSON.stringify(portResponse, null, 2));
  console.log('\n');

  console.log('================================================================');
  console.log('STDIO VERIFICATION COMPLETE — CLOSING CLIENT');
  console.log('================================================================');

  await transport.close();
}

runStdioVerification().catch(err => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});

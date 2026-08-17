import axios from 'axios';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required to run live verification scripts.');
  process.exit(1);
}

async function testScenario(title, message) {
  console.log(`\n================================================================`);
  console.log(`[${new Date().toISOString()}] TEST SCENARIO: ${title}`);
  console.log(`User Message: "${message}"`);
  console.log(`================================================================`);

  const userId = '64b0f0000000000000000001';
  const token = jwt.sign({ userId, email: 'test_agent@wealthgenie.io', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 45000,
  });

  const startTime = Date.now();
  const res = await client.post('/api/chat/message', {
    message,
    session_id: `live-replan-${Date.now()}`,
  });
  const durationMs = Date.now() - startTime;

  console.log(`[${new Date().toISOString()}] Live HTTP Response received (${durationMs}ms):`);
  console.log(`- Provider: ${res.data.provider}`);
  console.log(`- Grounded: ${res.data.grounded}`);
  console.log(`- State: ${res.data.state}`);
  console.log(`- Replans Count: ${res.data.audit?.replan_count ?? 0}`);
  console.log(`- Replans Audit Trail:\n`, JSON.stringify(res.data.audit?.replans || [], null, 2));
  console.log(`- Executed Tools:\n`, JSON.stringify(res.data.audit?.tool_outputs || [], null, 2));
  console.log(`- Tokens Used: ${res.data.audit?.tokens_used}`);
  console.log(`\n- Final Agent Response Text:\n${res.data.response}\n`);
}

async function main() {
  await testScenario(
    'Scenario 1: Reasoning-Driven Tool Invocation & Rebalancing',
    'Calculate the future value of a monthly SIP of ₹25,000 at 12% annual returns over 10 years, and also compute rebalancing directives for my current allocation of 70% Equity and 30% Debt to target 50-50.'
  );

  await testScenario(
    'Scenario 2: Ambiguous Goal Planning & Tool Execution',
    'I want to plan for a target corpus of ₹2.5 Crores in 20 years at 12% return. What monthly investment is needed, and what would a 10 Lakh lump sum grow to over the same horizon?'
  );
}

main().catch(err => {
  console.error('Test Failed:', err.response?.data || err);
  process.exit(1);
});

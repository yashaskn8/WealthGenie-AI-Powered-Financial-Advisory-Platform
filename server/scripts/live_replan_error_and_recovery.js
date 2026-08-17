import axios from 'axios';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required to run live verification scripts.');
  process.exit(1);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting live test of self-correcting replanning loop...`);

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

  // Prompt that tests boundary handling and parameter self-correction
  const message = 'Please use your projection tools to calculate: I want to invest ₹50 per month into a SIP for 10 years at 12% return. If ₹50 is too low for the tool, automatically adjust to the minimum valid amount of ₹100 and calculate that.';
  console.log(`Sending live request: "${message}"`);

  const startTime = Date.now();
  const res = await client.post('/api/chat/message', {
    message,
    session_id: `live-replan-recovery-${Date.now()}`,
  });
  const latency = Date.now() - startTime;

  console.log(`\n=================== LIVE REPLAN ERROR RECOVERY REPORT ===================`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Latency: ${latency}ms`);
  console.log(`Provider: ${res.data.provider}`);
  console.log(`Grounded: ${res.data.grounded}`);
  console.log(`State: ${res.data.state}`);
  console.log(`Replan Count: ${res.data.audit?.replan_count ?? 0}`);
  console.log(`Replans Audit Trail:\n`, JSON.stringify(res.data.audit?.replans || [], null, 2));
  console.log(`Tool Outputs:\n`, JSON.stringify(res.data.audit?.tool_outputs || [], null, 2));
  console.log(`\nFinal Response:\n${res.data.response}`);
  console.log(`========================================================================\n`);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err);
});

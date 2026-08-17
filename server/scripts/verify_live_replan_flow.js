import axios from 'axios';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET || '8f9e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e';

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

  const message = 'I want to calculate my monthly SIP growth. Calculate future value for ₹15,000 monthly investment at 12.5% return for 12 years.';
  console.log(`Sending live request: "${message}"`);

  const startTime = Date.now();
  const res = await client.post('/api/chat/message', {
    message,
    session_id: `live-replan-trace-${Date.now()}`,
  });
  const latency = Date.now() - startTime;

  console.log(`\n=================== LIVE REPLAN AUDIT REPORT ===================`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Latency: ${latency}ms`);
  console.log(`Provider: ${res.data.provider}`);
  console.log(`Grounded: ${res.data.grounded}`);
  console.log(`State: ${res.data.state}`);
  console.log(`Replan Count: ${res.data.audit?.replan_count}`);
  console.log(`Replans Audit:`, JSON.stringify(res.data.audit?.replans || [], null, 2));
  console.log(`Tool Outputs:`, JSON.stringify(res.data.audit?.tool_outputs || [], null, 2));
  console.log(`Response:\n${res.data.response}`);
  console.log(`================================================================\n`);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err);
});

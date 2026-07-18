const WebSocket = require('ws');
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const db = new Client({ connectionString: process.env.APP_DATABASE_URL });
  await db.connect();

  const userId = '11111111-1111-1111-1111-111111111111';
  await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]).catch(() => {});

  // Agent A
  const deviceIdA = crypto.randomUUID();
  const deviceKeyA = 'agent-a-key';
  const hashA = crypto.createHash('sha256').update(deviceKeyA).digest('hex');
  await db.query(`INSERT INTO rt_devices (id, user_id, device_key_hash, status, name) VALUES ($1, $2, $3, 'online', 'Agent A')`, [deviceIdA, userId, hashA]);

  // Agent B
  const deviceIdB = crypto.randomUUID();
  const deviceKeyB = 'agent-b-key';
  const hashB = crypto.createHash('sha256').update(deviceKeyB).digest('hex');
  await db.query(`INSERT INTO rt_devices (id, user_id, device_key_hash, status, name) VALUES ($1, $2, $3, 'online', 'Agent B')`, [deviceIdB, userId, hashB]);

  const wsA = new WebSocket(`ws://127.0.0.1:3001/runtime?deviceKey=${deviceKeyA}`);
  const wsB = new WebSocket(`ws://127.0.0.1:3001/runtime?deviceKey=${deviceKeyB}`);

  let resumeReceivedA = false;
  let resumeReceivedB = false;

  wsA.on('message', (data) => {
    const msg = data.toString();
    console.log('wsA msg:', msg);
    if (msg.includes('resume_runtime')) {
      resumeReceivedA = true;
      console.log('Agent A received resume_runtime!');
    }
  });

  wsB.on('message', (data) => {
    const msg = data.toString();
    console.log('wsB msg:', msg);
    if (msg.includes('resume_runtime')) {
      resumeReceivedB = true;
      console.log('Agent B received resume_runtime!');
    }
  });

  await delay(1000);

  // User client to create session
  const ticket = 'test-ticket-' + Date.now();
  const Redis = require('ioredis');
  const redis = new Redis(process.env.WS_REDIS_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  await redis.setex(`ws:ticket:${ticket}`, 60, JSON.stringify({ userId }));

  const sessionId = crypto.randomUUID();
  await db.query(`
    INSERT INTO rt_runtime_sessions (id, device_id, user_id, status, runtime_kind)
    VALUES ($1, $2, $3, 'active', 'terminal')
  `, [sessionId, deviceIdA, userId]);

  // Explicitly map session to device in Redis
  await redis.setex(`runtime:session_device:${sessionId}`, 86400, deviceIdA);

  await delay(1000);

  console.log('Pausing session...');
  const resPause = await fetch(`http://127.0.0.1:3001/runtime/sessions/${sessionId}/pause`, {
    method: 'POST',
    headers: { 'x-user-id': userId, 'x-m2m-token': process.env.M2M_TOKEN || '' }
  });
  console.log('Pause response:', await resPause.json());

  console.log('Resuming session...');
  const resResume = await fetch(`http://127.0.0.1:3001/runtime/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'x-user-id': userId, 'x-m2m-token': process.env.M2M_TOKEN || '' }
  });
  console.log('Resume response:', await resResume.json());

  await delay(2000);

  console.log('Test result:');
  console.log('Agent A got resume:', resumeReceivedA);
  console.log('Agent B got resume:', resumeReceivedB);

  wsA.close();
  wsB.close();
  redis.disconnect();
  await db.end();
}

main().catch(console.error);

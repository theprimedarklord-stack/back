require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');
const WebSocket = require('ws');
const { spawn } = require('child_process');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Connecting to database...');
  const db = new Client({ connectionString: process.env.APP_DATABASE_URL });
  await db.connect();
  
  await db.query(`DELETE FROM rt_runtime_sessions WHERE device_id IN (SELECT id FROM rt_devices WHERE name = 'Test Device')`);
  await db.query(`DELETE FROM rt_devices WHERE name = 'Test Device'`);

  console.log('Starting server...');
  const server = spawn('npm.cmd', ['run', 'start:dev'], { stdio: 'pipe', shell: true });
  
  server.stdout.on('data', data => {
    process.stdout.write('[SERVER] ' + data.toString());
  });
  server.stderr.on('data', data => {
    process.stderr.write('[SERVER ERR] ' + data.toString());
  });

  await delay(45000);
  console.log('Server assumed running.');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  let userId;
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (users && users.users.length > 0) {
    userId = users.users[0].id;
  } else {
    const { data: newUser } = await supabase.auth.admin.createUser({
      email: 'grace-test-' + Date.now() + '@example.com',
      password: 'password123',
      email_confirm: true
    });
    userId = newUser.user.id;
  }
  await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]).catch(() => {});
  
  const deviceKey = 'grace-test-key-' + Date.now();
  const hash = crypto.createHash('sha256').update(deviceKey).digest('hex');
  const deviceId = crypto.randomUUID();
  
  await db.query(`
    INSERT INTO rt_devices (id, user_id, device_key_hash, status, name)
    VALUES ($1, $2, $3, 'offline', 'Test Device')
  `, [deviceId, userId, hash]);
  
  await db.query(`
    INSERT INTO rt_runtime_sessions (id, device_id, user_id, status, runtime_kind)
    VALUES ($1, $2, $3, 'active', 'portable-pty')
  `, [crypto.randomUUID(), deviceId, userId]);
  
  console.log('\n--- TEST 1: Fast reconnect ---');
  let ws1 = new WebSocket(`ws://localhost:3001/runtime?deviceKey=${deviceKey}`);
  ws1.on('open', () => console.log('Device connected (1st time)'));
  
  await delay(2000);
  console.log('Disconnecting device...');
  ws1.close();
  
  await delay(5000);
  
  let res = await db.query(`SELECT status FROM rt_devices WHERE id=$1`, [deviceId]);
  console.log('DB status after disconnect (should be online because of grace period):', res.rows[0].status);
  
  console.log('Reconnecting device (<45s)...');
  let ws2 = new WebSocket(`ws://localhost:3001/runtime?deviceKey=${deviceKey}`);
  ws2.on('open', () => console.log('Device reconnected (2nd time)'));
  
  await delay(2000);
  res = await db.query(`SELECT status FROM rt_devices WHERE id=$1`, [deviceId]);
  console.log('DB status after reconnect:', res.rows[0].status);
  
  console.log('\n--- TEST 2: Timeout ---');
  ws2.close();
  console.log('Device disconnected. Waiting 55s for timeout...');
  
  await delay(55000);
  
  res = await db.query(`SELECT status FROM rt_devices WHERE id=$1`, [deviceId]);
  console.log('DB status after timeout (>45s):', res.rows[0].status);
  
  const sessionRes = await db.query(`SELECT status FROM rt_runtime_sessions WHERE device_id=$1 LIMIT 1`, [deviceId]);
  console.log('Session status after timeout (>45s):', sessionRes.rows[0].status);
  
  server.kill();
  await db.query(`DELETE FROM rt_runtime_sessions WHERE device_id=$1`, [deviceId]);
  await db.query(`DELETE FROM rt_devices WHERE id=$1`, [deviceId]);
  await db.end();
}
run().catch(console.error);

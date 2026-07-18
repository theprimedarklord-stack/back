require('dotenv').config();
const { Client } = require('pg');

async function check() {
  const db = new Client({ connectionString: process.env.APP_DATABASE_URL });
  await db.connect();
  
  await db.query(`UPDATE rt_devices SET status = 'online' WHERE name = 'Test Device'`);
  const res = await db.query(`UPDATE rt_devices SET status = 'offline', last_seen_at = NOW() WHERE name = 'Test Device' RETURNING *`);
  console.log('Update result:', res.rows);
  await db.end();
}
check().catch(console.error);

const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const db = new Client({ connectionString: process.env.APP_DATABASE_URL });
  await db.connect();
  const res = await db.query(`
    INSERT INTO rt_runtime_sessions (id, user_id, device_id, status, map_card_id, runtime_kind)
    VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'e641a90a-566d-4470-8d1e-3ab02e5df956', 'active', 999, 'terminal')
    RETURNING id
  `);
  console.log('Inserted session', res.rows[0].id);
  await db.end();
}
main().catch(console.error);

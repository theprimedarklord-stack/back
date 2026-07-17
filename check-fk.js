const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();

const client = new Client({
  connectionString: process.env.APP_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  const sql = fs.readFileSync('./db/migrations/20260715_runtime_sessions_v2.sql', 'utf8');
  console.log("Running migration...");
  await client.query(sql);
  console.log("Migration executed successfully!");
  
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'rt_runtime_sessions';
  `);
  console.log("Columns of rt_runtime_sessions:", cols.rows.filter(c => ['node_id', 'map_card_id', 'organization_id'].includes(c.column_name)));
  
  await client.end();
}

run().catch(console.error);

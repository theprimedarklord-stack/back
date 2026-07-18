const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://app_backend.xvcbxejefbigtrtugmaw:Gfeevf5GhJHh6ddsaHHGH123GGHgd@aws-0-us-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query('SELECT id, updated_at, data_core FROM map_cards ORDER BY updated_at DESC LIMIT 1;');
  if (res.rows.length > 0) {
    const row = res.rows[0];
    console.log(`MapCard ID: ${row.id}`);
    console.log(`Updated at: ${row.updated_at}`);
    const runtimeNode = row.data_core?.nodes?.find(n => n.type === 'runtime');
    if (runtimeNode) {
      console.log('Runtime node found!');
      console.log('Node Data:', JSON.stringify(runtimeNode.data, null, 2));
      if ('mapCardId' in runtimeNode.data) {
        console.log('FAIL: mapCardId is present!');
      } else {
        console.log('SUCCESS: mapCardId is missing from data!');
      }
    } else {
      console.log('No runtime node found in this map_card.');
    }
  } else {
    console.log('No map_cards found.');
  }
  await client.end();
}

run().catch(console.error);

require('dotenv').config();
const Redis = require('ioredis');
const WebSocket = require('ws');

async function runTest() {
  console.log('Connecting to Redis...');
  const redis = new Redis(process.env.WS_REDIS_URL);
  
  await redis.set('ws:ticket:legacy123', 'legacy-user-id', 'EX', 30);
  console.log('Legacy ticket set');
  
  await redis.set('ws:ticket:json123', JSON.stringify({ userId: 'json-user-id', orgId: 'org-123' }), 'EX', 30);
  console.log('JSON ticket set');

  const testTicket = (ticketName) => {
    return new Promise((resolve) => {
      console.log(`Connecting WS with ticket=${ticketName}...`);
      const ws = new WebSocket(`ws://localhost:3001/runtime?ticket=${ticketName}`);
      
      const timeout = setTimeout(() => {
        console.log(`[${ticketName}] Connection stayed open for 2s without closing (SUCCESS).`);
        ws.close();
        resolve(true);
      }, 2000);

      ws.on('open', () => {
        console.log(`[${ticketName}] WS Connected!`);
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        console.log(`[${ticketName}] WS Closed with code ${code}, reason: ${reason}`);
        resolve(false);
      });
      
      ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`[${ticketName}] WS Error:`, err.message);
        resolve(false);
      });
    });
  };

  await testTicket('legacy123');
  await testTicket('json123');

  redis.disconnect();
  process.exit(0);
}

runTest();

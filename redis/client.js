// redis/client.js
const { createClient } = require('redis');

const client = createClient(); // will use localhost:6379 by default

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Redis');
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
  }
})();

module.exports = client;

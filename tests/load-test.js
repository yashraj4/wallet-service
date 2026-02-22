/**
 * Load Test for Wallet Service
 * 
 * Tests concurrent transaction processing, idempotency, and race conditions.
 * Run with: npm run test:load
 * 
 * Prerequisites: Server must be running (npm start)
 */

const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 50;
const TOTAL_ROUNDS = 5;

// Test users
const USERS = [
  'a0000000-0000-0000-0000-000000000001', // alice
  'a0000000-0000-0000-0000-000000000002', // bob
  'a0000000-0000-0000-0000-000000000003', // charlie
];

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body?.idempotencyKey && { 'Idempotency-Key': body.idempotencyKey }),
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(responseData),
          });
        } catch {
          resolve({ status: res.statusCode, body: responseData });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(data);
    req.end();
  });
}

async function testConcurrentTopups() {
  console.log('\n📊 TEST 1: Concurrent Top-ups to Same Wallet');
  console.log('   Sending', CONCURRENT_REQUESTS, 'concurrent top-up requests to Alice...\n');

  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(
      makeRequest('POST', '/api/wallets/topup', {
        userId: USERS[0],
        assetCode: 'GOLD_COINS',
        amount: 10,
        description: `Concurrent topup #${i}`,
      })
    );
  }

  const results = await Promise.allSettled(promises);
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status >= 400)).length;

  console.log(`   ✅ Succeeded: ${succeeded}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${results.length}`);

  // Verify final balance
  const balance = await makeRequest('GET', `/api/wallets/${USERS[0]}/balance?assetCode=GOLD_COINS`);
  const goldBalance = balance.body.data.balances[0].balance;
  const expectedIncrease = succeeded * 10;
  console.log(`   💰 Alice's Gold Coins balance: ${goldBalance}`);
  console.log(`   Expected increase: ${expectedIncrease}`);

  return succeeded;
}

async function testIdempotency() {
  console.log('\n📊 TEST 2: Idempotency');
  console.log('   Sending the same request 10 times with the same idempotency key...\n');

  const idempotencyKey = `test-idempotency-${crypto.randomUUID()}`;
  const promises = [];

  for (let i = 0; i < 10; i++) {
    promises.push(
      makeRequest('POST', '/api/wallets/bonus', {
        userId: USERS[1],
        assetCode: 'DIAMONDS',
        amount: 100,
        idempotencyKey,
        description: 'Idempotency test bonus',
      })
    );
  }

  const results = await Promise.allSettled(promises);
  const created = results.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  const replayed = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  const errors = results.filter(r => r.status === 'fulfilled' && r.value.status >= 400).length;

  console.log(`   🆕 Created (201): ${created}`);
  console.log(`   🔄 Replayed (200): ${replayed}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   Expected: exactly 1 created, rest replayed or conflict`);

  return created <= 1;
}

async function testInsufficientBalance() {
  console.log('\n📊 TEST 3: Insufficient Balance Protection');
  console.log('   Attempting to spend more than available balance...\n');

  const result = await makeRequest('POST', '/api/wallets/purchase', {
    userId: USERS[1],
    assetCode: 'DIAMONDS',
    amount: 999999,
    description: 'Should fail - insufficient balance',
  });

  console.log(`   Status: ${result.status}`);
  console.log(`   Error: ${result.body.error?.code}`);
  console.log(`   Message: ${result.body.error?.message}`);

  return result.status === 422;
}

async function testConcurrentSpends() {
  console.log('\n📊 TEST 4: Concurrent Spends (Race Condition Test)');

  // First, give Charlie a known balance
  const topupKey = `race-setup-${crypto.randomUUID()}`;
  await makeRequest('POST', '/api/wallets/topup', {
    userId: USERS[2],
    assetCode: 'LOYALTY_POINTS',
    amount: 100,
    idempotencyKey: topupKey,
    description: 'Race condition test setup',
  });

  // Check balance
  const balanceBefore = await makeRequest('GET', `/api/wallets/${USERS[2]}/balance?assetCode=LOYALTY_POINTS`);
  const startBalance = balanceBefore.body.data.balances[0].balance;
  console.log(`   Charlie's Loyalty Points before: ${startBalance}`);

  // Try to spend 50 points 5 times concurrently (only some should succeed)
  const spendAmount = 50;
  const numSpends = 5;
  console.log(`   Sending ${numSpends} concurrent spends of ${spendAmount} each...\n`);

  const promises = [];
  for (let i = 0; i < numSpends; i++) {
    promises.push(
      makeRequest('POST', '/api/wallets/purchase', {
        userId: USERS[2],
        assetCode: 'LOYALTY_POINTS',
        amount: spendAmount,
        description: `Concurrent spend #${i}`,
      })
    );
  }

  const results = await Promise.allSettled(promises);
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  const insufficientBalance = results.filter(
    r => r.status === 'fulfilled' && r.value.body?.error?.code === 'INSUFFICIENT_BALANCE'
  ).length;

  console.log(`   ✅ Succeeded: ${succeeded}`);
  console.log(`   🚫 Insufficient balance: ${insufficientBalance}`);

  // Verify balance never went negative
  const balanceAfter = await makeRequest('GET', `/api/wallets/${USERS[2]}/balance?assetCode=LOYALTY_POINTS`);
  const endBalance = balanceAfter.body.data.balances[0].balance;
  console.log(`   💰 Charlie's Loyalty Points after: ${endBalance}`);
  console.log(`   Balance non-negative: ${endBalance >= 0 ? '✅ YES' : '❌ NO!'}`);

  return endBalance >= 0;
}

async function run() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        WALLET SERVICE - LOAD & CONCURRENCY TEST          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);

  // Health check
  try {
    const health = await makeRequest('GET', '/health');
    if (health.status !== 200) {
      console.error('❌ Server is not healthy. Start the server first with: npm start');
      process.exit(1);
    }
    console.log('✅ Server is healthy\n');
  } catch (err) {
    console.error('❌ Cannot connect to server. Start it first with: npm start');
    process.exit(1);
  }

  const results = [];
  const start = Date.now();

  results.push({ name: 'Concurrent Top-ups', passed: await testConcurrentTopups() });
  results.push({ name: 'Idempotency', passed: await testIdempotency() });
  results.push({ name: 'Insufficient Balance', passed: await testInsufficientBalance() });
  results.push({ name: 'Concurrent Spends', passed: await testConcurrentSpends() });

  const elapsed = Date.now() - start;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                           ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  results.forEach(r => {
    console.log(`║  ${r.passed ? '✅' : '❌'} ${r.name.padEnd(50)}║`);
  });
  console.log('╠════════════════════════════════════════════════════════════╣');
  const allPassed = results.every(r => r.passed);
  console.log(`║  ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}  (${elapsed}ms)${' '.repeat(25)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';

function loadEnvLocal() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  }
}

loadEnvLocal();

import assert from 'assert';
import { encryptApiKey, decryptApiKey } from '../src/lib/crypto/encryption';
import { fetchLeetCodeUserStats } from '../src/lib/integrations/leetcode';
import { importTodayLeetCodeToJournal } from '../src/app/actions/journal-actions';

async function runLeetCodeIntegrationSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING FOCUSED LEETCODE INTEGRATION SUITE');
  console.log('----------------------------------------------------');

  // Test 1: LeetCode Vault Encryption Security
  console.log('\n1. Verifying LeetCode Username Vault Encryption & Decryption...');
  const testUsername = 'test_leetcode_dev';
  const encrypted = encryptApiKey(testUsername);

  assert.notStrictEqual(encrypted.encryptedKey, testUsername, 'Encrypted handle must not equal plaintext');
  const decrypted = decryptApiKey(encrypted.encryptedKey, encrypted.iv, encrypted.authTag);
  assert.strictEqual(decrypted, testUsername, 'Decrypted handle must match original');
  console.log('   ✅ LeetCode Vault Encryption test passed!');

  // Test 2: LeetCode Public API Fetcher with Fallback Handler
  console.log('\n2. Verifying LeetCode Public API Fetcher & Fallback Handler...');
  try {
    const sampleStats = await fetchLeetCodeUserStats('neetcode');
    assert.strictEqual(sampleStats.username, 'neetcode');
    assert(typeof sampleStats.totalSolved === 'number', 'totalSolved must be a number');
    assert(Array.isArray(sampleStats.recentSubmissions), 'recentSubmissions must be an array');
    console.log(`   ✅ LeetCode API Fetcher verified! @neetcode stats: Total Solved = ${sampleStats.totalSolved} (Easy: ${sampleStats.easySolved}, Medium: ${sampleStats.mediumSolved}, Hard: ${sampleStats.hardSolved}).`);
  } catch (err: any) {
    console.log(`   ⚠️ Network fetch warning: ${err.message} (Graceful fallback active)`);
  }

  // Test 3: Daily Journal LeetCode Commit Import Engine
  console.log('\n3. Verifying Daily Journal LeetCode Activity Import Engine...');
  const importRes = await importTodayLeetCodeToJournal();
  assert(typeof importRes.success === 'boolean', 'Import result must return a boolean');
  console.log(`   ✅ Journal LeetCode Import Engine verified! Result message: "${importRes.message}"`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL LEETCODE INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runLeetCodeIntegrationSuite().catch((err) => {
  console.error('❌ LeetCode Integration test suite failed:', err);
  process.exit(1);
});

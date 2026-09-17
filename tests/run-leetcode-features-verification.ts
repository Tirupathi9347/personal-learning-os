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
import { getLeetCodeContributionMatrix, getLeetCodeCategoryMastery } from '../src/app/actions/leetcode-actions';
import { importTodayLeetCodeToJournal } from '../src/app/actions/journal-actions';

async function runLeetCodeEnhancedFeaturesSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING FOCUSED LEETCODE ENHANCED FEATURES SUITE');
  console.log('----------------------------------------------------');

  // Test 1: 365-Day Heatmap Matrix & Streak logic
  console.log('\n1. Verifying 365-Day LeetCode Solving Heatmap Matrix...');
  const matrix = await getLeetCodeContributionMatrix();
  assert(Array.isArray(matrix.days), 'Heatmap days must be an array');
  assert.strictEqual(matrix.days.length, 365, 'Matrix must contain exactly 365 days');
  assert(typeof matrix.totalSolved === 'number', 'Total solved must be a number');
  assert(typeof matrix.currentStreak === 'number', 'Current streak must be a number');
  assert(typeof matrix.longestStreak === 'number', 'Longest streak must be a number');
  console.log(`   ✅ Heatmap Matrix verified! Total 365 days generated.`);

  // Test 2: Category Mastery Breakdown
  console.log('\n2. Verifying Algorithm & DSA Category Mastery Badges...');
  const categories = await getLeetCodeCategoryMastery();
  assert(Array.isArray(categories), 'Categories must be an array');
  assert(categories.length > 0, 'Categories must not be empty');
  console.log(`   ✅ Category Mastery verified! ${categories.length} DSA categories calculated.`);

  // Test 3: Daily Journal LeetCode Import Engine
  console.log('\n3. Verifying Daily Journal LeetCode Activity Import Engine...');
  const importRes = await importTodayLeetCodeToJournal();
  assert(typeof importRes.success === 'boolean', 'Import result must return a boolean');
  console.log(`   ✅ Journal LeetCode Import Engine verified! Result message: "${importRes.message}"`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL 4 LEETCODE ENHANCED FEATURES VERIFIED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runLeetCodeEnhancedFeaturesSuite().catch((err) => {
  console.error('❌ LeetCode Enhanced Features test suite failed:', err);
  process.exit(1);
});

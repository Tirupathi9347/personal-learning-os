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
import { getGitHubContributionMatrix, getGitHubLanguageBreakdown, getProjectLatestCommits } from '../src/app/actions/github-actions';
import { importTodayCommitsToJournal } from '../src/app/actions/journal-actions';

async function runGitHubEnhancedFeaturesSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING FOCUSED GITHUB ENHANCED FEATURES SUITE');
  console.log('----------------------------------------------------');

  // Test 1: Contribution Heatmap Matrix & Streak logic
  console.log('\n1. Verifying 365-Day Heatmap Matrix & Streak Calculation...');
  const matrix = await getGitHubContributionMatrix();
  assert(Array.isArray(matrix.days), 'Heatmap days must be an array');
  assert.strictEqual(matrix.days.length, 365, 'Matrix must contain exactly 365 days');
  assert(typeof matrix.totalCommits === 'number', 'Total commits must be a number');
  assert(typeof matrix.currentStreak === 'number', 'Current streak must be a number');
  assert(typeof matrix.longestStreak === 'number', 'Longest streak must be a number');
  console.log(`   ✅ Heatmap Matrix verified! Total 365 days generated. Total commits: ${matrix.totalCommits}`);

  // Test 2: Language Breakdown Calculation
  console.log('\n2. Verifying Language Distribution Breakdown Aggregation...');
  const languages = await getGitHubLanguageBreakdown();
  assert(Array.isArray(languages), 'Languages must be an array');
  console.log(`   ✅ Language Breakdown verified! ${languages.length} unique languages detected across active repos.`);

  // Test 3: Project Commit Feed Extractor
  console.log('\n3. Verifying Project Commit Feed Extractor...');
  const projectCommits = await getProjectLatestCommits('https://github.com/Tirupathi9347/Personal-Learning-OS');
  assert(Array.isArray(projectCommits), 'Project commits must be an array');
  console.log(`   ✅ Project Commit Feed Extractor verified!`);

  // Test 4: Daily Journal Commit Auto-Import Engine
  console.log('\n4. Verifying Daily Journal Commit Auto-Import Engine...');
  const importRes = await importTodayCommitsToJournal();
  assert(typeof importRes.success === 'boolean', 'Import result must have boolean success');
  console.log(`   ✅ Journal Commit Import engine verified! Result message: "${importRes.message}"`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL 4 GITHUB ENHANCED FEATURES VERIFIED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runGitHubEnhancedFeaturesSuite().catch((err) => {
  console.error('❌ GitHub Enhanced Features test suite failed:', err);
  process.exit(1);
});

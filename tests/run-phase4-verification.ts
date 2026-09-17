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
import { getAnalyticsOverview } from '../src/app/actions/analytics-actions';
import { getMistakes } from '../src/app/actions/mistake-actions';
import { universalSearch } from '../src/app/actions/search-actions';

async function runPhase4Suite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING FOCUSED PHASE 4 MODULES SUITE');
  console.log('----------------------------------------------------');

  // Test 1: Analytics Overview Aggregation
  console.log('\n1. Verifying Analytics Overview Aggregation...');
  const analytics = await getAnalyticsOverview();
  assert(Array.isArray(analytics.studyTimeCurve), 'studyTimeCurve must be an array');
  assert(Array.isArray(analytics.activityTrends), 'activityTrends must be an array');
  assert(typeof analytics.consistencyScore === 'number', 'consistencyScore must be a number');
  assert(typeof analytics.totalHoursLogged === 'number', 'totalHoursLogged must be a number');
  console.log(`   ✅ Analytics verified! Learning Consistency: ${analytics.consistencyScore}%, Total Hours: ${analytics.totalHoursLogged} hrs.`);

  // Test 2: Mistake Engine Fetcher & Schema Safety
  console.log('\n2. Verifying Mistake Engine Fetcher & Schema Safety...');
  const mistakes = await getMistakes();
  assert(Array.isArray(mistakes), 'Mistakes must be an array');
  console.log(`   ✅ Mistake Engine fetcher verified! (${mistakes.length} mistakes retrieved).`);

  // Test 3: Universal Cross-Entity Search Engine
  console.log('\n3. Verifying Universal Cross-Entity Search Engine...');
  const searchResults = await universalSearch('test');
  assert(Array.isArray(searchResults), 'Search results must be an array');
  console.log(`   ✅ Universal Search verified! Returned ${searchResults.length} matching entities.`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL PHASE 4 MODULES VERIFIED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
  process.exit(0);
}

runPhase4Suite().catch((err) => {
  console.error('❌ Phase 4 test suite failed:', err);
  process.exit(1);
});

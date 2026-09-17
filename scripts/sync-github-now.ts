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

import { syncGitHubData } from '../src/app/actions/github-actions';

async function testSyncNow() {
  console.log('Running live GitHub synchronization for @Tirupathi9347...');
  const res = await syncGitHubData();
  
  if (res.success) {
    console.log(`🎉 GITHUB SYNC SUCCESSFUL!`);
    console.log(` - Synced Repositories: ${res.syncedReposCount}`);
    console.log(` - Synced Activity Events & Commits: ${res.syncedEventsCount}`);
  } else {
    console.error('❌ GitHub Sync Error:', res.error);
  }
}

testSyncNow();

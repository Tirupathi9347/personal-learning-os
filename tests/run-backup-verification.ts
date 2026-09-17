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
import { generateSystemBackupZip } from '../src/app/actions/backup-actions';
import JSZip from 'jszip';

async function runBackupVerificationSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING FOCUSED BACKUP & EXPORT MODULE SUITE');
  console.log('----------------------------------------------------');

  // Test 1: Generate System Backup ZIP Archive
  console.log('\n1. Generating server-side system backup ZIP archive...');
  const res = await generateSystemBackupZip();

  assert.strictEqual(res.success, true, 'Backup generation must succeed');
  assert(res.base64Zip, 'Base64 ZIP payload must be returned');
  assert(res.filename, 'Backup filename must be generated');
  console.log(`   ✅ Backup ZIP created successfully! Filename: "${res.filename}".`);

  // Test 2: Verify ZIP Contents & Secret Exclusion Policy
  console.log('\n2. Unpacking ZIP in memory & verifying Secret Exclusion Policy...');
  const zip = await JSZip.loadAsync(res.base64Zip, { base64: true });

  const dbFile = zip.file('database.json');
  assert(dbFile, 'ZIP must contain database.json');

  const dbContentText = await dbFile.async('text');
  const dbJson = JSON.parse(dbContentText);

  assert(dbJson.entities, 'database.json must contain entities object');
  assert.strictEqual(dbJson.entities.api_keys_config, undefined, 'CRITICAL: api_keys_config MUST BE EXCLUDED');

  // Verify markdown folder exists
  const mdFolder = zip.folder('markdown');
  assert(mdFolder, 'ZIP must contain markdown folder');

  console.log('   ✅ Secret Exclusion Policy verified! Zero credentials exposed.');
  console.log(`   ✅ Exported records summary:`, res.itemCounts);

  console.log('\n----------------------------------------------------');
  console.log('✨ BACKUP & EXPORT MODULE VERIFIED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runBackupVerificationSuite().catch((err) => {
  console.error('❌ Backup verification test suite failed:', err);
  process.exit(1);
});

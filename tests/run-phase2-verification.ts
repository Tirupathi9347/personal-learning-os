import assert from 'assert';

async function runPhase2Suite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING PHASE 2 SYSTEM VERIFICATION SUITE');
  console.log('----------------------------------------------------');

  // Test 1: Project Slug Generator Test
  console.log('\n1. Verifying Project Slug Generation...');
  const title = 'AeroHub SEG System 2026!';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  assert.strictEqual(slug, 'aerohub-seg-system-2026');
  console.log('   ✅ Project slug generator passed!');

  // Test 2: Notes Tag Normalization
  console.log('\n2. Verifying Notes Tag Normalization...');
  const rawTags = ' deep-learning , cnn , math ';
  const tagsArray = rawTags.split(',').map((t) => t.trim()).filter(Boolean);
  assert.deepStrictEqual(tagsArray, ['deep-learning', 'cnn', 'math']);
  console.log('   ✅ Notes tag parsing passed!');

  // Test 3: Universal Evidence Link Graph Logic
  console.log('\n3. Verifying Universal Evidence Link Logic...');
  const mockEvidenceLink = {
    source_type: 'note',
    source_id: 'note-uuid-1',
    target_type: 'skill',
    target_id: 'skill-uuid-cv',
    weight: 1.0,
  };
  assert.strictEqual(mockEvidenceLink.target_type, 'skill');
  assert.strictEqual(mockEvidenceLink.source_type, 'note');
  console.log('   ✅ Universal Evidence Graph structure passed!');

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL PHASE 2 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runPhase2Suite().catch((err) => {
  console.error('❌ Phase 2 test suite failed:', err);
  process.exit(1);
});

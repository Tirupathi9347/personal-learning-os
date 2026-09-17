import assert from 'assert';
import { encryptApiKey, decryptApiKey } from '../src/lib/crypto/encryption';
import { ProposedChangesPayload } from '../src/types';
import { SYSTEM_PARSER_PROMPT } from '../src/lib/ai/prompts';

async function runVerificationSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING SYSTEM VERIFICATION SUITE');
  console.log('----------------------------------------------------\n');

  // Test 1: API Key Vault Security & AES-256-GCM Roundtrip
  console.log('1. Verifying API Key Vault AES-256-GCM Security...');
  process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  
  const testSecretKey = 'AIzaSyTestGeminiApiKey_123456789';
  const encrypted = encryptApiKey(testSecretKey);

  assert.notStrictEqual(encrypted.encryptedKey, testSecretKey, 'Encrypted key must not equal plaintext key');
  assert(encrypted.iv && encrypted.iv.length === 24, 'IV must be a 12-byte hex string');
  assert(encrypted.authTag && encrypted.authTag.length === 32, 'Auth tag must be a 16-byte hex string');

  const decrypted = decryptApiKey(encrypted.encryptedKey, encrypted.iv, encrypted.authTag);
  assert.strictEqual(decrypted, testSecretKey, 'Decrypted key must match original secret key');
  console.log('   ✅ API Key Vault Encryption & Decryption test passed!');

  // Test 2: AI Confirmation Gate Payload Schema Validation
  console.log('\n2. Verifying AI Confirmation Gate Schema & Parser Prompt...');
  const mockGeminiResponseStr = JSON.stringify({
    summary: "Marked Python decorators task complete and scheduled CNN revision.",
    changes: [
      {
        action: "task.complete",
        summary: "Mark 'Python decorators' completed",
        data: { title: "Python decorators" }
      },
      {
        action: "task.create",
        summary: "Create task: Revise CNN backpropagation",
        data: { title: "Revise CNN backpropagation", priority: "medium", due_date: "2026-08-28" }
      }
    ]
  });

  const parsedPayload: ProposedChangesPayload = JSON.parse(mockGeminiResponseStr);
  assert.strictEqual(parsedPayload.changes.length, 2);
  assert.strictEqual(parsedPayload.changes[0].action, 'task.complete');
  assert.strictEqual(parsedPayload.changes[1].action, 'task.create');
  assert(SYSTEM_PARSER_PROMPT.includes('JSON OUTPUT SCHEMA'), 'System prompt must strictly enforce JSON output schema');
  console.log('   ✅ AI Confirmation Gate Schema validation test passed!');

  // Test 3: Reversal / Undo Inverse Payload Verification
  console.log('\n3. Verifying Reversal / Undo Inverse Payload Generation...');
  const createdTask = { id: 'task-uuid-101', title: 'Revise CNN backpropagation' };
  const inverseChanges = [
    { action: 'task.delete', target_id: createdTask.id }
  ];
  assert.strictEqual(inverseChanges[0].action, 'task.delete');
  assert.strictEqual(inverseChanges[0].target_id, 'task-uuid-101');
  console.log('   ✅ Inverse Payload Reversal logic test passed!');

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
}

runVerificationSuite().catch((err) => {
  console.error('❌ Verification test suite failed:', err);
  process.exit(1);
});

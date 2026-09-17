/**
 * Automated Verification Suite for Feature 2C: Goal / Event Intake
 * 
 * Verifies:
 * 1. Valid student goals intake and normalization (Exam prep, skill improvement, schedule planning)
 * 2. Empty / invalid goal rejection
 * 3. Valid system events intake (Missed tasks, deadlines, score updates)
 * 4. Unknown event type and invalid timestamp rejection
 * 5. Tenant / user isolation enforcement
 * 6. Manual vs automated trigger distinction
 * 7. Timestamp & payload context preservation (No fabricated facts)
 * 8. Seamless integration from AgentTriggerContext to AgentRunState
 */

import assert from 'assert';
import {
  validateAndIntakeStudentGoal,
  validateAndIntakeSystemEvent,
  createAgentInitialStateFromTrigger,
  normalizeGoalText,
  detectGoalCategory,
  StudentGoalInput,
  SystemEventInput,
} from '../src/lib/agent';

async function runIntakeVerificationSuite() {
  console.log('------------------------------------------------------------');
  console.log('📥 RUNNING GOAL / EVENT INTAKE VERIFICATION (FEATURE 2C)');
  console.log('------------------------------------------------------------');

  const authUserId = 'student-auth-id-777';

  // ----------------------------------------------------
  // TEST 1: Valid Student Goals Intake & Normalization
  // ----------------------------------------------------
  console.log('\nTest 1: Verifying Valid Student Goals Intake & Normalization...');

  const sampleGoals: { raw: string; expectedCategory: string; skill?: string }[] = [
    {
      raw: '   Prepare me for my DBMS exam in 7 days \n  with practice problems.  ',
      expectedCategory: 'EXAM_PREPARATION',
      skill: 'DBMS',
    },
    {
      raw: 'Help me improve my Python skills for data engineering',
      expectedCategory: 'SKILL_IMPROVEMENT',
      skill: 'Python',
    },
    {
      raw: 'Plan my week around my upcoming deadlines and exams',
      expectedCategory: 'EXAM_PREPARATION', // includes exam
    },
    {
      raw: 'Please evaluate and corroborate my verified evidence links',
      expectedCategory: 'CORROBORATION_AUDIT',
    },
  ];

  for (const item of sampleGoals) {
    const input: StudentGoalInput = {
      userId: authUserId,
      rawGoalText: item.raw,
      targetSkillName: item.skill,
    };

    const res = validateAndIntakeStudentGoal(input, authUserId);
    assert(res.success && res.triggerContext, `Goal intake failed for: "${item.raw}"`);
    const ctx = res.triggerContext;

    assert.strictEqual(ctx.userId, authUserId);
    assert.strictEqual(ctx.triggerType, 'STUDENT_GOAL');
    assert.strictEqual(ctx.isAutomated, false);
    assert.strictEqual(ctx.eventTrigger, 'MANUAL_GOAL');
    assert.strictEqual(ctx.goalCategory, item.expectedCategory);
    assert.strictEqual(ctx.normalizedGoalText, normalizeGoalText(item.raw));
    assert(!ctx.normalizedGoalText.includes('\n'));
    assert(!ctx.normalizedGoalText.startsWith(' '));
    assert.strictEqual(ctx.priority, 'MEDIUM');
  }
  console.log('   ✅ All 4 diverse student goals successfully normalized and categorized.');

  // ----------------------------------------------------
  // TEST 2: Empty / Invalid Goal Rejection
  // ----------------------------------------------------
  console.log('\nTest 2: Verifying Empty and Malformed Goal Rejection...');

  const invalidGoals = [
    { raw: '', code: 'ERR_EMPTY_GOAL_TEXT' },
    { raw: '   \t\n  ', code: 'ERR_EMPTY_GOAL_TEXT' },
    { raw: '\x00\x01\x02', code: 'ERR_EMPTY_GOAL_TEXT' }, // Only non-printable control chars
    { raw: 'a'.repeat(2005), code: 'ERR_GOAL_TEXT_TOO_LONG' },
  ];

  for (const inv of invalidGoals) {
    const res = validateAndIntakeStudentGoal(
      { userId: authUserId, rawGoalText: inv.raw },
      authUserId
    );
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, inv.code);
  }

  // Missing User ID
  const noUserRes = validateAndIntakeStudentGoal({ userId: '', rawGoalText: 'Valid text' });
  assert.strictEqual(noUserRes.success, false);
  assert.strictEqual(noUserRes.error?.code, 'ERR_MISSING_USER_ID');

  console.log('   ✅ All empty, control-character, oversized, and missing-user goals strictly rejected.');

  // ----------------------------------------------------
  // TEST 3: Valid System Events Intake
  // ----------------------------------------------------
  console.log('\nTest 3: Verifying Valid System Events Intake...');

  const sampleEvents: SystemEventInput[] = [
    {
      userId: authUserId,
      eventType: 'MISSED_TASK',
      source: 'task',
      eventTimestamp: new Date().toISOString(),
      entityId: 'task-dbms-101',
      payload: { title: 'Normalize 3NF Relations', priority: 'high' },
      severity: 'HIGH',
    },
    {
      userId: authUserId,
      eventType: 'APPROACHING_DEADLINE',
      source: 'calendar',
      eventTimestamp: new Date().toISOString(),
      entityId: 'event-midterm-01',
      payload: { itemTitle: 'Operating Systems Midterm', dueDate: '2026-09-20' },
      severity: 'HIGH',
    },
    {
      userId: authUserId,
      eventType: 'GITHUB_ACTIVITY_CHANGE',
      source: 'github',
      eventTimestamp: new Date().toISOString(),
      payload: { commitsCount: 14, repoName: 'learning-os' },
      severity: 'LOW',
    },
    {
      userId: authUserId,
      eventType: 'ASSESSMENT_RESULT_CHANGED',
      source: 'assessment',
      eventTimestamp: new Date().toISOString(),
      payload: { skillName: 'React', newScore: 85, previousScore: 60 },
      severity: 'MEDIUM',
    },
  ];

  for (const evt of sampleEvents) {
    const res = validateAndIntakeSystemEvent(evt, authUserId);
    assert(res.success && res.triggerContext, `System event intake failed for: ${evt.eventType}`);
    const ctx = res.triggerContext;

    assert.strictEqual(ctx.userId, authUserId);
    assert.strictEqual(ctx.triggerType, 'SYSTEM_EVENT');
    assert.strictEqual(ctx.isAutomated, true);
    assert.strictEqual(ctx.systemEventType, evt.eventType);
    assert.strictEqual(ctx.eventTimestamp, evt.eventTimestamp);
    assert(ctx.normalizedGoalText.startsWith('System Event:'));
    assert(ctx.contextData.source === evt.source);
  }
  console.log('   ✅ All 4 real-world system events safely validated and intaked.');

  // ----------------------------------------------------
  // TEST 4: Unknown Event Payload Rejection
  // ----------------------------------------------------
  console.log('\nTest 4: Verifying Malformed and Unknown Event Rejection...');

  // Invalid event type
  const badTypeRes = validateAndIntakeSystemEvent(
    {
      userId: authUserId,
      eventType: 'UNKNOWN_RANDOM_EVENT' as any,
      source: 'system',
      eventTimestamp: new Date().toISOString(),
      payload: {},
    },
    authUserId
  );
  assert.strictEqual(badTypeRes.success, false);
  assert.strictEqual(badTypeRes.error?.code, 'ERR_INVALID_EVENT_TYPE');

  // Invalid timestamp
  const badTimeRes = validateAndIntakeSystemEvent(
    {
      userId: authUserId,
      eventType: 'MISSED_TASK',
      source: 'task',
      eventTimestamp: 'not-a-valid-date-timestamp',
      payload: {},
    },
    authUserId
  );
  assert.strictEqual(badTimeRes.success, false);
  assert.strictEqual(badTimeRes.error?.code, 'ERR_INVALID_TIMESTAMP');

  // Null payload
  const nullPayloadRes = validateAndIntakeSystemEvent(
    {
      userId: authUserId,
      eventType: 'MISSED_TASK',
      source: 'task',
      eventTimestamp: new Date().toISOString(),
      payload: null as any,
    },
    authUserId
  );
  assert.strictEqual(nullPayloadRes.success, false);
  assert.strictEqual(nullPayloadRes.error?.code, 'ERR_INVALID_EVENT_PAYLOAD');

  console.log('   ✅ Unknown types, malformed timestamps, and non-object payloads strictly blocked.');

  // ----------------------------------------------------
  // TEST 5: User Isolation Enforcement
  // ----------------------------------------------------
  console.log('\nTest 5: Verifying User / Tenant Isolation Boundaries...');

  const attackerUserId = 'attacker-user-999';
  const victimUserId = 'victim-user-111';

  // Unauthenticated / missing user ID check
  const missingUserGoalRes = validateAndIntakeStudentGoal(
    { userId: '', rawGoalText: 'Goal without user' }
  );
  assert.strictEqual(missingUserGoalRes.success, false);
  assert.strictEqual(missingUserGoalRes.error?.code, 'ERR_MISSING_USER_ID');

  const crossUserGoalRes = validateAndIntakeStudentGoal(
    { userId: victimUserId, rawGoalText: 'Steal study plan' },
    attackerUserId // Session is attacker
  );
  assert.strictEqual(crossUserGoalRes.success, false);
  assert.strictEqual(crossUserGoalRes.error?.code, 'ERR_UNAUTHORIZED_USER_MISMATCH');

  const crossUserEventRes = validateAndIntakeSystemEvent(
    {
      userId: victimUserId,
      eventType: 'MISSED_TASK',
      source: 'task',
      eventTimestamp: new Date().toISOString(),
      payload: {},
    },
    attackerUserId
  );
  assert.strictEqual(crossUserEventRes.success, false);
  assert.strictEqual(crossUserEventRes.error?.code, 'ERR_UNAUTHORIZED_USER_MISMATCH');

  console.log('   ✅ Tenant isolation & auth boundary verified: Missing auth and cross-user trigger attempts safely blocked.');

  // ----------------------------------------------------
  // TEST 6: Manual vs Automated Trigger Distinction
  // ----------------------------------------------------
  console.log('\nTest 6: Verifying Manual vs Automated Trigger Distinction...');

  const goalRes = validateAndIntakeStudentGoal(
    { userId: authUserId, rawGoalText: 'Prepare for Python test' },
    authUserId
  );
  assert.strictEqual(goalRes.triggerContext?.isAutomated, false);
  assert.strictEqual(goalRes.triggerContext?.triggerType, 'STUDENT_GOAL');
  assert.strictEqual(goalRes.triggerContext?.eventTrigger, 'MANUAL_GOAL');

  const eventRes = validateAndIntakeSystemEvent(
    {
      userId: authUserId,
      eventType: 'SCHEDULED_AUDIT_TICK',
      source: 'system',
      eventTimestamp: new Date().toISOString(),
      payload: {},
    },
    authUserId
  );
  assert.strictEqual(eventRes.triggerContext?.isAutomated, true);
  assert.strictEqual(eventRes.triggerContext?.triggerType, 'SYSTEM_EVENT');
  assert.strictEqual(eventRes.triggerContext?.eventTrigger, 'SCHEDULED_AUDIT');

  console.log('   ✅ Clear, un-ambiguous distinction preserved between manual and automated triggers.');

  // ----------------------------------------------------
  // TEST 7: Timestamp and Context Preservation
  // ----------------------------------------------------
  console.log('\nTest 7: Verifying Timestamp & Context Preservation...');

  const originalTimestamp = '2026-09-15T12:30:00.000Z';
  const customMetadata = { courseCode: 'CS301', importance: 'exam_review' };

  const preservedRes = validateAndIntakeSystemEvent(
    {
      userId: authUserId,
      eventType: 'NEW_ASSIGNMENT',
      source: 'calendar',
      eventTimestamp: originalTimestamp,
      entityId: 'assign-456',
      payload: { title: 'B-Tree Implementation', skillName: 'Data Structures' },
      metadata: customMetadata,
    },
    authUserId
  );

  const ctx = preservedRes.triggerContext!;
  assert.strictEqual(ctx.eventTimestamp, originalTimestamp);
  assert.strictEqual(ctx.entityId, 'assign-456');
  assert.strictEqual(ctx.targetSkillName, 'Data Structures');
  assert.strictEqual(ctx.contextData.courseCode, 'CS301');
  assert.strictEqual(ctx.timeframeHint, null); // Unsupplied fields stay null, NOT fabricated

  // Verify transition to AgentRunState
  const agentState = createAgentInitialStateFromTrigger(ctx);
  assert.strictEqual(agentState.currentState, 'IDLE');
  assert.strictEqual(agentState.context.userId, authUserId);
  assert.strictEqual(agentState.context.eventTrigger, 'PROACTIVE_RECOMMENDATION');
  assert.strictEqual(agentState.context.goal, ctx.normalizedGoalText);
  assert(agentState.context.metadata?.triggerContext !== undefined);

  console.log('   ✅ Exact timestamps, payload attributes, and clean state conversion verified.');

  console.log('\n------------------------------------------------------------');
  console.log('✨ ALL GOAL / EVENT INTAKE (FEATURE 2C) VERIFICATION TESTS PASSED!');
  console.log('------------------------------------------------------------');
}

runIntakeVerificationSuite().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

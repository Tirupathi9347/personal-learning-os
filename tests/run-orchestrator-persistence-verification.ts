/**
 * Automated Verification Suite for Feature 2E-2: Learning Orchestrator Persistence Integration
 * 
 * Verifies:
 * 1. Run creation and persistence
 * 2. State transition persistence after each meaningful step
 * 3. Working-memory persistence & serialization
 * 4. WAITING_FOR_APPROVAL persistence & resume without duplicate runs
 * 5. REPLANNING persistence (Replans counter preserved)
 * 6. COMPLETED terminal persistence with timestamps
 * 7. FAILED terminal persistence with failure info
 * 8. Duplicate-resume protection (Same runId updated in-place)
 * 9. User isolation boundaries (RLS and user scoping)
 * 10. Persistence failure handling (Never silent failure)
 * 11. Sensitive data exclusion (Secrets, tokens, API keys strictly stripped)
 */

import assert from 'assert';
import {
  runLearningOrchestrator,
  resumeLearningOrchestrator,
  persistAgentRunState,
  loadAgentRunFromDb,
  sanitizeWorkingMemory,
  deserializeDbRecordToAgentRun,
  AgentRunDbRecord,
  AgentRunState,
  createInitialAgentState,
  transitionAgentState,
} from '../src/lib/agent';

// Mock in-memory Supabase Client for isolated, deterministic unit testing
function createMockSupabaseClient(authenticatedUserId: string) {
  const store = new Map<string, AgentRunDbRecord>();

  return {
    store,
    client: {
      from(table: string) {
        if (table !== 'agent_runs') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          upsert(record: AgentRunDbRecord, options?: { onConflict?: string }) {
            return {
              select() {
                return {
                  single() {
                    // Simulate RLS: Ensure user_id matches authenticated user
                    if (record.user_id !== authenticatedUserId) {
                      return Promise.resolve({
                        data: null,
                        error: { message: 'RLS violation: Unauthorized cross-user insert/update.' },
                      });
                    }
                    store.set(record.id, { ...record });
                    return Promise.resolve({ data: store.get(record.id), error: null });
                  },
                };
              },
            };
          },
          select(columns?: string) {
            return {
              eq(col: string, val: any) {
                return {
                  single() {
                    const row = store.get(val);
                    if (!row || row.user_id !== authenticatedUserId) {
                      return Promise.resolve({ data: null, error: { message: 'Row not found or access denied.' } });
                    }
                    return Promise.resolve({ data: row, error: null });
                  },
                };
              },
              order(col: string, opt?: any) {
                return {
                  limit(count: number) {
                    const rows = Array.from(store.values())
                      .filter((r) => r.user_id === authenticatedUserId)
                      .slice(0, count);
                    return Promise.resolve({ data: rows, error: null });
                  },
                };
              },
            };
          },
        };
      },
    } as any,
  };
}

async function runOrchestratorPersistenceVerificationSuite() {
  console.log('------------------------------------------------------------------');
  console.log('💾 RUNNING ORCHESTRATOR PERSISTENCE VERIFICATION (FEATURE 2E-2)');
  console.log('------------------------------------------------------------------');

  const userId = 'student-test-user-persist-999';
  const goal = 'Corroborate Python and DBMS skills with ground-truth evidence';

  // ----------------------------------------------------
  // TEST 1: Run Creation & Active State Persistence
  // ----------------------------------------------------
  console.log('\nTest 1: Verifying Run Creation and Transition Persistence...');
  const { client: mockDb, store } = createMockSupabaseClient(userId);

  const execResult = await runLearningOrchestrator(
    { userId, goal },
    {
      supabase: mockDb,
      handlers: {
        onObserving: async () => ({
          evidenceCollection: {
            collectedAt: new Date().toISOString(),
            totalRecords: 1,
            records: [
              {
                id: 'ev-test-py',
                source: 'github',
                classification: 'EXTERNALLY_VERIFIED',
                targetSkillName: 'Python',
                description: 'Python Repo (24 commits)',
                polarity: 'SUPPORTS',
                weight: 0.8,
                observedAt: new Date().toISOString(),
              },
            ],
            sourcesSummary: { profile: 0, github: 1, leetcode: 0, mistake: 0, project: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
            connectedSources: ['github'],
            unconnectedSources: [],
            errors: [],
          },
        }),
        onAssessing: async () => ({
          requiresPlanning: false,
          reason: 'Assessment finished; analytical query.',
        }),
      },
    }
  );

  assert.strictEqual(execResult.status, 'COMPLETED');
  assert.strictEqual(execResult.persisted, true);
  assert(store.has(execResult.finalState.runId), 'Run record must be saved in agent_runs table');

  const savedRecord = store.get(execResult.finalState.runId)!;
  assert.strictEqual(savedRecord.id, execResult.finalState.runId);
  assert.strictEqual(savedRecord.user_id, userId);
  assert.strictEqual(savedRecord.status, 'COMPLETED');
  assert.strictEqual(savedRecord.current_state, 'COMPLETED');
  assert(savedRecord.transition_history.length >= 5);
  console.log(`   ✅ Run created and persisted across transitions (Status = ${savedRecord.status}, History = ${savedRecord.transition_history.length} records).`);

  // ----------------------------------------------------
  // TEST 2: Working Memory Persistence & Decision Context
  // ----------------------------------------------------
  console.log('\nTest 2: Verifying Working Memory & Decision Context Persistence...');
  assert(savedRecord.working_memory.decisionReadyAssessment !== undefined);
  const assessment = savedRecord.working_memory.decisionReadyAssessment as any;
  assert.strictEqual(assessment.skillsEvaluated.length, 1);
  assert.strictEqual(assessment.skillsEvaluated[0].skillName, 'Python');
  console.log(`   ✅ Decision-ready assessment preserved in working_memory JSONB: Skill = ${assessment.skillsEvaluated[0].skillName}`);

  // ----------------------------------------------------
  // TEST 3: WAITING_FOR_APPROVAL Persistence & Resume
  // ----------------------------------------------------
  console.log('\nTest 3: Verifying WAITING_FOR_APPROVAL Persistence and Resume (In-Place Update)...');
  const { client: approvalDb, store: approvalStore } = createMockSupabaseClient(userId);

  const pausedResult = await runLearningOrchestrator(
    { userId, goal },
    {
      supabase: approvalDb,
      handlers: {
        onPlanning: async () => ({
          requiresApproval: true,
          approvalRequest: {
            id: 'req_pause_01',
            actionType: 'GENERATE_CUSTOM_QUIZ',
            description: 'Generate 10 diagnostic questions for Python',
            riskLevel: 'MEDIUM',
            payload: { skill: 'Python', count: 10 },
            requestedAt: new Date().toISOString(),
            decision: 'PENDING',
          },
          reason: 'Quiz generation requires confirmation.',
        }),
      },
    }
  );

  assert.strictEqual(pausedResult.status, 'PAUSED_FOR_APPROVAL');
  assert.strictEqual(pausedResult.persisted, true);
  const pausedRunId = pausedResult.finalState.runId;

  // Check saved DB row is PAUSED_FOR_APPROVAL
  const pausedDbRow = approvalStore.get(pausedRunId)!;
  assert.strictEqual(pausedDbRow.current_state, 'WAITING_FOR_APPROVAL');
  assert.strictEqual(pausedDbRow.status, 'PAUSED_FOR_APPROVAL');
  assert.strictEqual(pausedDbRow.approval_request?.decision, 'PENDING');
  console.log('   ✅ Paused state persisted with PENDING approval request.');

  // Resume the existing run
  const resumeResult = await resumeLearningOrchestrator(
    pausedResult.finalState,
    {
      targetState: 'TOOL_SELECTION',
      decision: 'APPROVED',
      notes: 'Student approved quiz generation.',
    },
    {
      supabase: approvalDb,
      handlers: {
        onToolSelection: async () => ({ selectedTool: 'quiz_tool' }),
        onExecuting: async () => ({ executionOutput: { generated: true } }),
        onVerifying: async () => ({ verified: true }),
        onUpdating: async () => ({ hasMoreSteps: false }),
      },
    }
  );

  assert.strictEqual(resumeResult.status, 'COMPLETED');
  assert.strictEqual(resumeResult.persisted, true);
  assert.strictEqual(approvalStore.size, 1, 'Duplicate-resume protection: Exact 1 row in table');

  const resumedDbRow = approvalStore.get(pausedRunId)!;
  assert.strictEqual(resumedDbRow.id, pausedRunId, 'Run ID preserved across resume');
  assert.strictEqual(resumedDbRow.current_state, 'COMPLETED');
  assert.strictEqual(resumedDbRow.status, 'COMPLETED');
  assert.strictEqual(resumedDbRow.approval_request?.decision, 'APPROVED');
  console.log('   ✅ Resumed run updated in-place without duplicate row creation.');

  // ----------------------------------------------------
  // TEST 4: Loading Run from DB (Pause / Resume Observability)
  // ----------------------------------------------------
  console.log('\nTest 4: Verifying loadAgentRunFromDb() Deserialization...');
  const loadResult = await loadAgentRunFromDb(approvalDb, pausedRunId);
  assert(loadResult.success && loadResult.state !== undefined);
  assert.strictEqual(loadResult.state.runId, pausedRunId);
  assert.strictEqual(loadResult.state.userId, userId);
  assert.strictEqual(loadResult.state.currentState, 'COMPLETED');
  assert.strictEqual(loadResult.status, 'COMPLETED');
  console.log('   ✅ Successfully loaded and deserialized AgentRunState from DB.');

  // ----------------------------------------------------
  // TEST 5: REPLANNING Persistence
  // ----------------------------------------------------
  console.log('\nTest 5: Verifying REPLANNING Persistence & Counters...');
  const { client: replanDb, store: replanStore } = createMockSupabaseClient(userId);
  let replanFired = false;

  const replanExec = await runLearningOrchestrator(
    { userId, goal },
    {
      supabase: replanDb,
      handlers: {
        onPlanning: async () => ({ plan: 'test-plan' }),
        onToolSelection: async () => ({ selectedTool: 'test-tool' }),
        onExecuting: async () => ({ executionOutput: 'exec-out' }),
        onVerifying: async () => {
          if (!replanFired) {
            replanFired = true;
            return { verified: false, needsReplan: true, failureReason: 'Initial check missed edge case' };
          }
          return { verified: true };
        },
        onReplanning: async () => ({ nextState: 'PLANNING' }),
        onUpdating: async () => ({ hasMoreSteps: false }),
      },
    }
  );

  assert.strictEqual(replanExec.status, 'COMPLETED');
  const replanDbRow = replanStore.get(replanExec.finalState.runId)!;
  assert.strictEqual(replanDbRow.replans_count, 1);
  console.log(`   ✅ Replan count (${replanDbRow.replans_count}) accurately persisted in DB row.`);

  // ----------------------------------------------------
  // TEST 6: FAILED Terminal Persistence
  // ----------------------------------------------------
  console.log('\nTest 6: Verifying FAILED State Persistence with Error Details...');
  const { client: failDb, store: failStore } = createMockSupabaseClient(userId);

  const failExec = await runLearningOrchestrator(
    { userId, goal },
    {
      supabase: failDb,
      handlers: {
        onObserving: async () => {
          throw new Error('Supabase Auth session expired.');
        },
      },
    }
  );

  assert.strictEqual(failExec.status, 'FAILED');
  assert.strictEqual(failExec.persisted, true);
  const failDbRow = failStore.get(failExec.finalState.runId)!;
  assert.strictEqual(failDbRow.current_state, 'FAILED');
  assert.strictEqual(failDbRow.status, 'FAILED');
  assert(failDbRow.failure_info !== null);
  assert.strictEqual(failDbRow.failure_info?.code, 'ERR_UNHANDLED_EXCEPTION');
  assert(failDbRow.failure_info?.message.includes('Supabase Auth session expired'));
  console.log(`   ✅ FAILED state and failure_info persisted cleanly: ${failDbRow.failure_info?.code}`);

  // ----------------------------------------------------
  // TEST 7: Tenant & User Isolation (RLS)
  // ----------------------------------------------------
  console.log('\nTest 7: Verifying Tenant & User Isolation (RLS)...');
  const attackerUserId = 'attacker-user-000';
  const { client: attackerDb } = createMockSupabaseClient(attackerUserId);

  // Attacker attempts to read the victim's run
  const crossUserRead = await loadAgentRunFromDb(attackerDb, pausedRunId);
  assert.strictEqual(crossUserRead.success, false);
  assert.strictEqual(crossUserRead.error?.code, 'ERR_RUN_NOT_FOUND');
  console.log('   ✅ Cross-user DB read strictly blocked by simulated RLS boundary.');

  // ----------------------------------------------------
  // TEST 8: Sensitive Data Sanitization
  // ----------------------------------------------------
  console.log('\nTest 8: Verifying Sensitive Data Exclusion from Working Memory...');
  const taintedMemory = {
    decisionReadyAssessment: { score: 95 },
    geminiApiKey: 'AIzaSySecretApiKey12345',
    privateToken: 'ghp_secretTokenHere',
    nestedContext: {
      passwordHash: '$2b$10$secretHash',
      safeSummary: 'Python learning topic',
      authTag: 'tag_xyz_secret',
    },
  };

  const sanitized = sanitizeWorkingMemory(taintedMemory);
  assert.strictEqual((sanitized as any).geminiApiKey, undefined);
  assert.strictEqual((sanitized as any).privateToken, undefined);
  assert.strictEqual((sanitized.nestedContext as any).passwordHash, undefined);
  assert.strictEqual((sanitized.nestedContext as any).authTag, undefined);
  assert.strictEqual((sanitized.nestedContext as any).safeSummary, 'Python learning topic');
  console.log('   ✅ All API keys, passwords, auth tags, and tokens strictly stripped from persistence.');

  // ----------------------------------------------------
  // TEST 9: Persistence Failure Propagation (No Silent Failure)
  // ----------------------------------------------------
  console.log('\nTest 9: Verifying Persistence Failure Propagation...');
  const brokenDb = {
    from() {
      return {
        upsert() {
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: null, error: { message: 'Network connection lost.' } });
                },
              };
            },
          };
        },
      };
    },
  } as any;

  const brokenPersistExec = await runLearningOrchestrator(
    { userId, goal },
    {
      supabase: brokenDb,
      handlers: {
        onAssessing: async () => ({ requiresPlanning: false }),
      },
    }
  );

  assert.strictEqual(brokenPersistExec.persisted, false);
  assert(brokenPersistExec.persistenceError !== undefined);
  assert.strictEqual(brokenPersistExec.persistenceError?.code, 'ERR_PERSISTENCE_DB_ERROR');
  console.log(`   ✅ Persistence failure accurately captured: ${brokenPersistExec.persistenceError?.message}`);

  console.log('\n------------------------------------------------------------------');
  console.log('✨ ALL ORCHESTRATOR PERSISTENCE (FEATURE 2E-2) TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runOrchestratorPersistenceVerificationSuite().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

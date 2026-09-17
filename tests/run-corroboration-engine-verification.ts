import assert from 'assert';
import { 
  EvidenceRecord, 
  EvidenceCollectionResult, 
  corroborateStudentEvidence, 
  calculateSkillConfidence, 
  calculateCorroborationConfidence,
  EPISTEMIC_WEIGHTS,
  CONFIDENCE_CONSTANTS
} from '../src/lib/agent';

async function runCorroborationVerificationSuite() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING GROUND-TRUTH CORROBORATION ENGINE VERIFICATION');
  console.log('----------------------------------------------------\n');

  const now = new Date();
  const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
  const staleDate = new Date(now.getTime() - 250 * 24 * 60 * 60 * 1000).toISOString(); // 250 days ago

  // ----------------------------------------------------
  // TEST 1: Strong Externally Verified Evidence
  // ----------------------------------------------------
  console.log('Test 1: Verifying Strong Externally Verified Evidence...');
  const strongCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 4,
    records: [
      {
        id: 'ev-profile-ts',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'TypeScript',
        description: 'Self-reported proficiency: 4/5',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: recentDate,
        metrics: { score: 4, totalPossible: 5 },
      },
      {
        id: 'ev-gh-repo-ts',
        source: 'github',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'TypeScript',
        description: 'Verified repo: personal-learning-os (TypeScript, 10 stars)',
        polarity: 'SUPPORTS',
        weight: 0.8,
        observedAt: recentDate,
        metrics: { score: 10 },
      },
      {
        id: 'ev-gh-commit-ts',
        source: 'github',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'TypeScript',
        description: 'PushEvent: 8 commits on main',
        polarity: 'SUPPORTS',
        weight: 0.8,
        observedAt: recentDate,
      },
      {
        id: 'ev-project-ts',
        source: 'project',
        classification: 'OBSERVED',
        targetSkillName: 'TypeScript',
        description: 'Project: Agentic OS (completed)',
        polarity: 'SUPPORTS',
        weight: 0.7,
        observedAt: recentDate,
      },
    ],
    sourcesSummary: { profile: 1, github: 2, project: 1, leetcode: 0, mistake: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'github', 'project'],
    unconnectedSources: [],
    errors: [],
  };

  const strongCorroboration = corroborateStudentEvidence(strongCollection);
  const tsAudit = calculateSkillConfidence(strongCorroboration.skills[0]);

  assert.strictEqual(tsAudit.skillName, 'TypeScript');
  assert.strictEqual(tsAudit.claimedProficiency, 4);
  assert(tsAudit.evidenceBackedScore >= 0.70, `Score ${tsAudit.evidenceBackedScore} must be >= 0.70 for strong verified evidence`);
  assert.strictEqual(tsAudit.confidenceLevel, 'HIGH', 'Confidence level must be HIGH');
  assert.strictEqual(tsAudit.assessedProficiency, 4, 'Assessed proficiency should match claimed 4/5');
  assert.strictEqual(tsAudit.contradictions.length, 0, 'Should have 0 contradictions');
  console.log(`   ✅ Strong evidence: Score = ${tsAudit.evidenceBackedScore}, Level = ${tsAudit.confidenceLevel}, Assessed = ${tsAudit.assessedProficiency}/5`);

  // ----------------------------------------------------
  // TEST 2: Self-Reported Only Skill (Epistemic Skepticism)
  // ----------------------------------------------------
  console.log('\nTest 2: Verifying Self-Reported Only Skill...');
  const selfReportedCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 1,
    records: [
      {
        id: 'ev-profile-rust',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'Rust',
        description: 'Self-reported proficiency: 5/5 in profile',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: recentDate,
        metrics: { score: 5, totalPossible: 5 },
      },
    ],
    sourcesSummary: { profile: 1, github: 0, project: 0, leetcode: 0, mistake: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile'],
    unconnectedSources: [],
    errors: [],
  };

  const selfReportedCorroboration = corroborateStudentEvidence(selfReportedCollection);
  const rustAudit = calculateSkillConfidence(selfReportedCorroboration.skills[0]);

  assert.strictEqual(rustAudit.claimedProficiency, 5);
  assert(rustAudit.evidenceBackedScore <= 0.05, `Score ${rustAudit.evidenceBackedScore} must be <= 0.05 for pure self-claim`);
  assert.strictEqual(rustAudit.confidenceLevel, 'UNVERIFIED', 'Confidence level must be UNVERIFIED');
  assert.strictEqual(rustAudit.assessedProficiency, 1, 'Assessed proficiency must be calibrated to 1/5 for unverified claim');
  assert(rustAudit.missingEvidence.length > 0, 'Must have missing evidence requirements');
  console.log(`   ✅ Self-reported only: Score = ${rustAudit.evidenceBackedScore}, Level = ${rustAudit.confidenceLevel}, Assessed = ${rustAudit.assessedProficiency}/5`);

  // ----------------------------------------------------
  // TEST 3: Strong Supporting Evidence with Minor Mistakes
  // ----------------------------------------------------
  console.log('\nTest 3: Verifying Strong Supporting Evidence with Minor Mistakes...');
  const minorMistakeCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 4,
    records: [
      {
        id: 'ev-profile-py',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'Python',
        description: 'Claim: 4/5',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: recentDate,
        metrics: { score: 4, totalPossible: 5 },
      },
      {
        id: 'ev-gh-py',
        source: 'github',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'Python',
        description: 'Repo: ML Engine (Python)',
        polarity: 'SUPPORTS',
        weight: 0.8,
        observedAt: recentDate,
      },
      {
        id: 'ev-lc-py',
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'Python',
        description: 'LeetCode Medium Problem (Accepted, Python)',
        polarity: 'SUPPORTS',
        weight: 0.7,
        observedAt: recentDate,
      },
      {
        id: 'ev-mistake-py',
        source: 'mistake',
        classification: 'OBSERVED',
        targetSkillName: 'Python',
        description: 'Minor syntax mistake: Missing colon in loop',
        polarity: 'CONTRADICTS',
        weight: 0.2, // low severity
        observedAt: recentDate,
      },
    ],
    sourcesSummary: { profile: 1, github: 1, leetcode: 1, mistake: 1, project: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'github', 'leetcode', 'mistake'],
    unconnectedSources: [],
    errors: [],
  };

  const pyCorroboration = corroborateStudentEvidence(minorMistakeCollection);
  const pyAudit = calculateSkillConfidence(pyCorroboration.skills[0]);

  assert(pyAudit.evidenceBackedScore >= 0.50, `Score ${pyAudit.evidenceBackedScore} should remain solid despite minor mistake`);
  assert(pyAudit.confidenceLevel === 'MODERATE' || pyAudit.confidenceLevel === 'HIGH');
  assert(pyAudit.breakdown && pyAudit.breakdown.contradictionPenalty > 0, 'Contradiction penalty should be recorded');
  assert(pyAudit.breakdown && pyAudit.breakdown.contradictionPenalty < 0.35, 'Minor mistake should not excessively penalize');
  console.log(`   ✅ Minor mistake handling: Score = ${pyAudit.evidenceBackedScore}, Level = ${pyAudit.confidenceLevel}, Penalty = -${Math.round(pyAudit.breakdown!.contradictionPenalty * 100)}%`);

  // ----------------------------------------------------
  // TEST 4: Severe Contradictory Evidence (DBMS Example)
  // ----------------------------------------------------
  console.log('\nTest 4: Verifying Severe Contradictory Evidence (DBMS Case)...');
  const dbmsCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 4,
    records: [
      {
        id: 'ev-profile-dbms',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'DBMS',
        description: 'Self-reported: 4/5',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: recentDate,
        metrics: { score: 4, totalPossible: 5 },
      },
      {
        id: 'ev-mistake-dbms-1',
        source: 'mistake',
        classification: 'OBSERVED',
        targetSkillName: 'DBMS',
        description: 'Documented Mistake [critical severity]: Lost transaction atomicity due to uncommitted read',
        polarity: 'CONTRADICTS',
        weight: 0.8,
        observedAt: recentDate,
      },
      {
        id: 'ev-mistake-dbms-2',
        source: 'mistake',
        classification: 'OBSERVED',
        targetSkillName: 'DBMS',
        description: 'Documented Mistake [high severity]: BCNF normalization failure causing update anomaly',
        polarity: 'CONTRADICTS',
        weight: 0.6,
        observedAt: recentDate,
      },
      {
        id: 'ev-time-dbms',
        source: 'study_session',
        classification: 'OBSERVED',
        targetSkillName: 'DBMS',
        description: 'Focus timer: 60 mins on SQL',
        polarity: 'SUPPORTS',
        weight: 0.5,
        observedAt: recentDate,
        metrics: { durationMinutes: 60 },
      },
    ],
    sourcesSummary: { profile: 1, mistake: 2, study_session: 1, github: 0, leetcode: 0, project: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'mistake', 'study_session'],
    unconnectedSources: [],
    errors: [],
  };

  const dbmsCorroboration = corroborateStudentEvidence(dbmsCollection);
  const dbmsAudit = calculateSkillConfidence(dbmsCorroboration.skills[0]);

  assert.strictEqual(dbmsAudit.confidenceLevel, 'CONTRADICTED', 'Must flag CONTRADICTED for critical mistakes');
  assert(dbmsAudit.assessedProficiency! <= 2, `Assessed proficiency ${dbmsAudit.assessedProficiency} must be downgraded to <= 2`);
  assert(dbmsAudit.contradictions.length >= 1, 'Contradictions list must be populated');
  assert(dbmsAudit.contradictions.some((c) => c.severity === 'SEVERE'), 'Must contain SEVERE contradiction');
  console.log(`   ✅ Severe contradiction: Score = ${dbmsAudit.evidenceBackedScore}, Level = ${dbmsAudit.confidenceLevel}, Assessed = ${dbmsAudit.assessedProficiency}/5 (Claim was 4/5)`);

  // ----------------------------------------------------
  // TEST 5: Failed LeetCode Submissions Proportion
  // ----------------------------------------------------
  console.log('\nTest 5: Verifying Algorithmic Failure Ratio Impact...');
  const algoFailedCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 3,
    records: [
      {
        id: 'ev-profile-algo',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'Algorithms',
        description: 'Claim: 4/5',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: recentDate,
        metrics: { score: 4, totalPossible: 5 },
      },
      {
        id: 'ev-lc-fail-1',
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'Algorithms',
        description: 'LeetCode Medium Problem: "3Sum" [Status: Time Limit Exceeded]',
        polarity: 'CONTRADICTS',
        weight: 0.7,
        observedAt: recentDate,
      },
      {
        id: 'ev-lc-fail-2',
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'Algorithms',
        description: 'LeetCode Hard Problem: "Median of Two Sorted Arrays" [Status: Wrong Answer]',
        polarity: 'CONTRADICTS',
        weight: 0.9,
        observedAt: recentDate,
      },
    ],
    sourcesSummary: { profile: 1, leetcode: 2, github: 0, mistake: 0, project: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'leetcode'],
    unconnectedSources: [],
    errors: [],
  };

  const algoCorroboration = corroborateStudentEvidence(algoFailedCollection);
  const algoAudit = calculateSkillConfidence(algoCorroboration.skills[0]);

  assert.strictEqual(algoAudit.confidenceLevel, 'CONTRADICTED', 'All failed submissions with 0 accepted must flag CONTRADICTED');
  console.log(`   ✅ Failed submission proportion: Level = ${algoAudit.confidenceLevel}, Score = ${algoAudit.evidenceBackedScore}`);

  // ----------------------------------------------------
  // TEST 6: Stale Evidence Decay (250 Days Old)
  // ----------------------------------------------------
  console.log('\nTest 6: Verifying Evidence Staleness Decay (> 90 Days)...');
  const staleCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 2,
    records: [
      {
        id: 'ev-profile-java',
        source: 'profile',
        classification: 'SELF_REPORTED',
        targetSkillName: 'Java',
        description: 'Claim: 4/5',
        polarity: 'NEUTRAL',
        weight: 0.1,
        observedAt: staleDate,
        metrics: { score: 4, totalPossible: 5 },
      },
      {
        id: 'ev-gh-java',
        source: 'github',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: 'Java',
        description: 'Java Enterprise App (250 days ago)',
        polarity: 'SUPPORTS',
        weight: 0.8,
        observedAt: staleDate,
      },
    ],
    sourcesSummary: { profile: 1, github: 1, leetcode: 0, mistake: 0, project: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'github'],
    unconnectedSources: [],
    errors: [],
  };

  const staleCorroboration = corroborateStudentEvidence(staleCollection);
  const javaAudit = calculateSkillConfidence(staleCorroboration.skills[0]);

  assert.strictEqual(staleCorroboration.skills[0].freshness.isStale, true, 'Must flag isStale = true for 250d evidence');
  assert(javaAudit.breakdown && javaAudit.breakdown.freshnessMultiplier < 1.0, 'Freshness multiplier must be < 1.0');
  assert(javaAudit.missingEvidence.some((m) => m.description.includes('days old')), 'Must recommend fresh activity');
  console.log(`   ✅ Staleness decay: Freshness multiplier = ${javaAudit.breakdown!.freshnessMultiplier}, Score = ${javaAudit.evidenceBackedScore}`);

  // ----------------------------------------------------
  // TEST 7: Unmapped Evidence Isolation
  // ----------------------------------------------------
  console.log('\nTest 7: Verifying Unmapped Evidence Isolation...');
  const unmappedCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 2,
    records: [
      {
        id: 'ev-general-note',
        source: 'note',
        classification: 'SELF_REPORTED',
        targetSkillName: 'General',
        description: 'Miscellaneous thoughts',
        polarity: 'NEUTRAL',
        weight: 0.2,
        observedAt: recentDate,
      },
      {
        id: 'ev-blank-task',
        source: 'task',
        classification: 'OBSERVED',
        targetSkillName: '',
        description: 'Clean desk',
        polarity: 'NEUTRAL',
        weight: 0.2,
        observedAt: recentDate,
      },
    ],
    sourcesSummary: { note: 1, task: 1, profile: 0, github: 0, leetcode: 0, mistake: 0, project: 0, study_session: 0, journal: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['note', 'task'],
    unconnectedSources: [],
    errors: [],
  };

  const unmappedCorroboration = corroborateStudentEvidence(unmappedCollection);
  assert.strictEqual(unmappedCorroboration.unmappedEvidence.length, 2, 'Unmapped records must be preserved in unmappedEvidence');
  assert.strictEqual(unmappedCorroboration.skills.length, 0, 'Should not manufacture phantom skills for General items');
  console.log(`   ✅ Unmapped isolation: ${unmappedCorroboration.unmappedEvidence.length} items safely isolated.`);

  // ----------------------------------------------------
  // TEST 8: Bounded Score Invariance & Multi-Skill Audit
  // ----------------------------------------------------
  console.log('\nTest 8: Verifying Score Bounds [0, 1] and Aggregate Multi-Skill Audit...');
  const multiCollection: EvidenceCollectionResult = {
    collectedAt: now.toISOString(),
    totalRecords: 8,
    records: [
      ...strongCollection.records,
      ...selfReportedCollection.records,
      ...dbmsCollection.records,
    ],
    sourcesSummary: { profile: 3, github: 2, project: 1, mistake: 2, study_session: 1, leetcode: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile', 'github', 'project', 'mistake', 'study_session'],
    unconnectedSources: [],
    errors: [],
  };

  const multiCorroboration = corroborateStudentEvidence(multiCollection);
  const auditResult = calculateCorroborationConfidence(multiCorroboration, 'user-uuid-test');

  assert.strictEqual(auditResult.skillsEvaluated.length, 3, 'Should evaluate all 3 skills (TypeScript, Rust, DBMS)');
  for (const s of auditResult.skillsEvaluated) {
    assert(s.evidenceBackedScore >= 0.0 && s.evidenceBackedScore <= 1.0, `Score ${s.evidenceBackedScore} out of bounds`);
    assert(!isNaN(s.evidenceBackedScore), 'Score must not be NaN');
  }

  assert.strictEqual(auditResult.summary.highConfidenceCount, 1); // TypeScript
  assert.strictEqual(auditResult.summary.unverifiedCount, 1);     // Rust
  assert.strictEqual(auditResult.summary.contradictedCount, 1);   // DBMS
  assert(auditResult.summary.overallGroundTruthScore > 0 && auditResult.summary.overallGroundTruthScore < 1.0);
  assert(auditResult.warnings.length > 0, 'Audit must produce warnings for contradictions/unverified skills');
  console.log(`   ✅ Multi-skill Audit: Evaluated ${auditResult.skillsEvaluated.length} skills. Overall score = ${Math.round(auditResult.summary.overallGroundTruthScore * 100)}%`);

  // ----------------------------------------------------
  // TEST 9: Repeated Events Diminishing Returns (Anti-Inflation)
  // ----------------------------------------------------
  console.log('\nTest 9: Verifying Diminishing Returns (Anti-Inflation for 100 Repeated Events)...');
  const repeated10Commits: EvidenceRecord[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `ev-commit-${i}`,
    source: 'github' as const,
    classification: 'EXTERNALLY_VERIFIED' as const,
    targetSkillName: 'C++',
    description: `Commit #${i}`,
    polarity: 'SUPPORTS' as const,
    weight: 0.8,
    observedAt: recentDate,
  }));

  const repeated100Commits: EvidenceRecord[] = Array.from({ length: 100 }).map((_, i) => ({
    id: `ev-commit-100-${i}`,
    source: 'github' as const,
    classification: 'EXTERNALLY_VERIFIED' as const,
    targetSkillName: 'C++',
    description: `Commit #${i}`,
    polarity: 'SUPPORTS' as const,
    weight: 0.8,
    observedAt: recentDate,
  }));

  const c10Corroboration = corroborateStudentEvidence({
    collectedAt: now.toISOString(),
    totalRecords: 10,
    records: repeated10Commits,
    sourcesSummary: { github: 10, profile: 0, project: 0, leetcode: 0, mistake: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['github'],
    unconnectedSources: [],
    errors: [],
  });
  const c10Audit = calculateSkillConfidence(c10Corroboration.skills[0]);

  const c100Corroboration = corroborateStudentEvidence({
    collectedAt: now.toISOString(),
    totalRecords: 100,
    records: repeated100Commits,
    sourcesSummary: { github: 100, profile: 0, project: 0, leetcode: 0, mistake: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['github'],
    unconnectedSources: [],
    errors: [],
  });
  const c100Audit = calculateSkillConfidence(c100Corroboration.skills[0]);

  assert(c100Audit.evidenceBackedScore <= 1.0, 'Score for 100 commits must be <= 1.0');
  assert(c100Audit.evidenceBackedScore - c10Audit.evidenceBackedScore < 0.15, 'Diminishing returns must prevent 10x inflation from dominating');
  console.log(`   ✅ Anti-inflation verified: 10 commits = ${c10Audit.evidenceBackedScore}, 100 commits = ${c100Audit.evidenceBackedScore} (Score gracefully saturates <= 1.0)`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL CORROBORATION ENGINE VERIFICATION TESTS PASSED!');
  console.log('----------------------------------------------------');
}

runCorroborationVerificationSuite().catch((err) => {
  console.error('❌ Verification suite failed:', err);
  process.exit(1);
});

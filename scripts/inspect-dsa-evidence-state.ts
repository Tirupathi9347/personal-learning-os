import * as fs from 'fs';
import * as path from 'path';

// Pre-load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { collectStudentEvidence } from '../src/lib/agent/evidence-collector';
import { corroborateStudentEvidence } from '../src/lib/agent/corroboration-engine';
import { calculateSkillConfidence, calculateCorroborationConfidence } from '../src/lib/agent/confidence-calculator';
import { generateStudentLearningAssessmentDeterministic, categorizeSkillEvidence } from '../src/lib/agent/student-learning-assessment';
import { createServiceRoleClient } from '../src/lib/supabase/server';

async function main() {
  const collection = await collectStudentEvidence();
  console.log(`Total Evidence Records Collected: ${collection.totalRecords}`);
  console.log(`Sources Breakdown:`, collection.sourcesSummary);
  console.log(`Connected Sources:`, collection.connectedSources);

  const corroboration = corroborateStudentEvidence(collection);
  console.log(`\nTotal Skills Evaluated: ${corroboration.totalSkillsEvaluated}`);
  console.log(`Contradiction Summary:`, corroboration.contradictionSummary);
  console.log(`Missing Evidence Summary:`, corroboration.missingEvidenceSummary);

  const audit = calculateCorroborationConfidence(corroboration);

  const assessment = generateStudentLearningAssessmentDeterministic({
    userId: '9f900305-9e78-4edf-bd71-63fc04ed2d0d',
    corroborationResult: corroboration,
    corroborationAudit: audit,
  });

  const targetTopics = [
    'Programming Fundamentals',
    'Python Fundamentals',
    'Python',
    'Arrays',
    'Strings',
    'Basic Recursion',
    'Linked Lists',
    'Binary Trees',
    'Tree Recursion & Traversal',
    'Advanced Tree Patterns',
    'Dynamic Programming',
  ];

  console.log('\n--- TARGET DSA TOPIC EVALUATIONS ---');
  for (const topic of targetTopics) {
    const skillAudit = audit.skillsEvaluated.find(
      (s) => s.skillName.toLowerCase().trim() === topic.toLowerCase().trim()
    );
    const skillAssessment = assessment.skillAssessments.find(
      (s) => s.skillName.toLowerCase().trim() === topic.toLowerCase().trim()
    );

    if (!skillAudit) {
      console.log(`\n❓ Topic "${topic}": NOT FOUND IN EVALUATED SKILLS`);
      continue;
    }

    console.log(`\n📘 Topic: ${skillAudit.skillName}`);
    console.log(`   Claimed: ${skillAudit.claimedProficiency}/5, Assessed: ${skillAudit.assessedProficiency}/5, Score: ${skillAudit.evidenceBackedScore}`);
    console.log(`   Confidence: ${skillAudit.confidenceLevel}, Category: ${skillAssessment?.evidenceCategory}`);
    console.log(`   Counts: Total=${skillAudit.evidenceCount.total}, Supp=${skillAudit.evidenceCount.supporting}, Contra=${skillAudit.evidenceCount.contradicting}, ExtVer=${skillAudit.evidenceCount.externallyVerified}`);
    console.log(`   Records:`);
    for (const r of skillAudit.evidenceRecords) {
      console.log(`     [${r.polarity}] (${r.source}/${r.classification}) ${r.description.slice(0, 100)}`);
    }
    for (const c of skillAudit.contradictions) {
      console.log(`     - [${c.severity}] ${c.reason}`);
    }
    console.log(`   Missing Gaps (${skillAudit.missingEvidence.length}):`);
    for (const m of skillAudit.missingEvidence) {
      console.log(`     - [${m.requiredClassification}] ${m.description}`);
    }
    console.log(`   Supporting Reasons:`);
    for (const r of skillAudit.reasons) {
      console.log(`     * ${r}`);
    }
  }
}

main().catch((err) => {
  console.error('Error running inspection:', err);
  process.exit(1);
});

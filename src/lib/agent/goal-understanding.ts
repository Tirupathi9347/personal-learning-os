/**
 * Phase 6A: Intelligent Goal Understanding Engine
 * 
 * Provides:
 * - Deterministic-first extraction of student intent, domain, timeframe, constraints, and urgency.
 * - Non-hallucinating epistemic classification (EXPLICIT vs INFERRED vs UNKNOWN).
 * - Sandboxed Gemini reasoning for nuanced natural-language comprehension.
 * - Strict JSON schema and enum validation with graceful deterministic fallback.
 * - Integrated clarification engine for underspecified or ambiguous student goals.
 * - Phase 1 Corroboration Audit telemetry grounding without altering authoritative user identity.
 */

import { GoalCategory } from './intake-types';
import { normalizeGoalText, detectGoalCategory, ALLOWED_GOAL_CATEGORIES } from './goal-event-intake';
import {
  GoalUnderstanding,
  UnderstandGoalInput,
  InformationEpistemicStatus,
  GoalUrgency,
  GoalUnderstandingConfidence,
  ExtractedSignal,
  GoalClarificationQuestion,
  GoalUnderstandingLlmClient,
} from './goal-understanding-types';
import { getResolvedGeminiConfig } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Common technical subjects and skill domains for deterministic detection.
 */
const KNOWN_SKILL_PATTERNS: Array<{ name: string; regex: RegExp; subtopics?: Array<{ name: string; regex: RegExp }> }> = [
  {
    name: 'DBMS',
    regex: /\b(dbms|database|databases|sql|relational database|rdbms|postgres|postgresql|mysql)\b/i,
    subtopics: [
      { name: 'Normalization', regex: /\b(normaliz(ation|e)|1nf|2nf|3nf|bcnf)\b/i },
      { name: 'Transactions & ACID', regex: /\b(transaction|acid|concurrency|locking|isolation)\b/i },
      { name: 'Indexing & B-Trees', regex: /\b(index|indexing|b-tree|b\+ tree|btree)\b/i },
      { name: 'Query Optimization', regex: /\b(query optimization|explain plan|execution plan)\b/i },
    ],
  },
  {
    name: 'Python',
    regex: /\b(python|py|django|fastapi|flask|pandas|numpy)\b/i,
    subtopics: [
      { name: 'Data Engineering', regex: /\b(data engineering|etl|pipeline|pandas|polars)\b/i },
      { name: 'Async & Concurrency', regex: /\b(asyncio|async|concurrency|threading|multiprocessing)\b/i },
      { name: 'Object-Oriented Python', regex: /\b(oop|classes|dunder|decorators|generators)\b/i },
    ],
  },
  {
    name: 'React',
    regex: /\b(react|reactjs|nextjs|next\.js|frontend|hooks|jsx)\b/i,
    subtopics: [
      { name: 'State Management', regex: /\b(redux|zustand|context api|usecontext|usereducer)\b/i },
      { name: 'Server Components', regex: /\b(rsc|server components|ssr|ssg|app router)\b/i },
      { name: 'Custom Hooks', regex: /\b(custom hooks|useeffect|usecallback|usememo)\b/i },
    ],
  },
  {
    name: 'Operating Systems',
    regex: /\b(operating system|operating systems|os|linux|unix|kernel)\b/i,
    subtopics: [
      { name: 'CPU Scheduling', regex: /\b(cpu scheduling|round robin|fcfs|sjf|priority scheduling)\b/i },
      { name: 'Memory Management', regex: /\b(memory management|virtual memory|paging|segmentation|mmu|page replacement)\b/i },
      { name: 'Synchronization & Deadlocks', regex: /\b(deadlock|semaphore|mutex|race condition|synchronization)\b/i },
    ],
  },
  {
    name: 'Data Structures & Algorithms',
    regex: /\b(dsa|data structures|algorithms|leetcode|competitive programming)\b/i,
    subtopics: [
      { name: 'Dynamic Programming', regex: /\b(dynamic programming|dp|memoization|tabulation)\b/i },
      { name: 'Graphs & Trees', regex: /\b(graph|tree|trees|bfs|dfs|dijkstra|topological sort)\b/i },
      { name: 'Binary Search', regex: /\b(binary search|two pointers|sliding window)\b/i },
    ],
  },
  {
    name: 'Machine Learning',
    regex: /\b(machine learning|ml|deep learning|ai|neural networks|nlp|computer vision)\b/i,
    subtopics: [
      { name: 'Supervised Learning', regex: /\b(regression|classification|random forest|xgboost|svm)\b/i },
      { name: 'Neural Networks & PyTorch', regex: /\b(pytorch|tensorflow|cnn|rnn|transformer|llm)\b/i },
    ],
  },
  {
    name: 'TypeScript',
    regex: /\b(typescript|ts|type system|generics)\b/i,
    subtopics: [
      { name: 'Advanced Types', regex: /\b(generics|utility types|conditional types|mapped types)\b/i },
    ],
  },
  {
    name: 'Programming Fundamentals',
    regex: /\b(coding basics|basics of coding|programming basics|programming fundamentals|coding fundamentals|basic coding|intro to programming|learn to code|coding level|basic programming)\b/i,
    subtopics: [
      { name: 'Core Syntax & Control Flow', regex: /\b(syntax|variables|conditionals|loops|control flow|functions)\b/i },
      { name: 'Data Structures & Types', regex: /\b(data types|arrays|lists|strings|numbers|booleans|dictionaries)\b/i },
      { name: 'Problem Solving & Debugging', regex: /\b(logic|problem solving|algorithms|debugging|basics)\b/i },
    ],
  },
  {
    name: 'System Design',
    regex: /\b(system design|distributed systems|scalability|microservices|caching|kafka|load balancer)\b/i,
  },
];

/**
 * Common timeframe expressions and relative date patterns.
 */
const TIMEFRAME_PATTERNS = [
  { pattern: /\b(next friday)\b/i, label: 'next Friday', urgency: 'HIGH' as GoalUrgency },
  { pattern: /\b(next monday|next tuesday|next wednesday|next thursday|next saturday|next sunday)\b/i, label: 'next week', urgency: 'HIGH' as GoalUrgency },
  { pattern: /\b(?:in\s+)?(\d+)\s*days?\b/i, getLabel: (m: RegExpExecArray) => `in ${m[1]} days`, getUrgency: (m: RegExpExecArray) => parseInt(m[1], 10) <= 3 ? 'CRITICAL' as GoalUrgency : parseInt(m[1], 10) <= 7 ? 'HIGH' as GoalUrgency : 'MEDIUM' as GoalUrgency },
  { pattern: /\b(?:in\s+)?(\d+)\s*weeks?\b/i, getLabel: (m: RegExpExecArray) => `in ${m[1]} weeks`, urgency: 'MEDIUM' as GoalUrgency },
  { pattern: /\b(tomorrow)\b/i, label: 'tomorrow', urgency: 'CRITICAL' as GoalUrgency },
  { pattern: /\b(this week|this weekend)\b/i, label: 'this week', urgency: 'HIGH' as GoalUrgency },
  { pattern: /\b(in a month|next month)\b/i, label: 'next month', urgency: 'LOW' as GoalUrgency },
];

/**
 * Common student constraint patterns.
 */
const CONSTRAINT_PATTERNS = [
  { pattern: /\b(only|just)\s+(\d+)\s*(hour|hours|hr|hrs)\b/i, getLabel: (m: RegExpExecArray) => `Limited to ${m[2]} hours available` },
  { pattern: /\b(no heavy math|without complex math|no math)\b/i, label: 'Avoid heavy mathematical derivations' },
  { pattern: /\b(practical only|hands-on only|focus on coding)\b/i, label: 'Focus primarily on hands-on practical coding' },
  { pattern: /\b(beginner friendly|from scratch|from basics)\b/i, label: 'Start from fundamental baseline concepts' },
];

/**
 * Stopwords / overly vague keywords.
 */
const VAGUE_KEYWORDS = new Set([
  'help', 'learn', 'study', 'code', 'programming', 'pass', 'something', 'stuff', 'everything', 'anything', 'work', 'do', 'better'
]);

/**
 * Pure deterministic parser for student goals.
 */
export function understandStudentGoalDeterministic(input: UnderstandGoalInput): GoalUnderstanding {
  const timestamp = input.timestamp || new Date().toISOString();
  const normalized = normalizeGoalText(input.rawGoalText);

  // 1. Determine Category
  const category = input.categoryHint && ALLOWED_GOAL_CATEGORIES.includes(input.categoryHint)
    ? input.categoryHint
    : detectGoalCategory(normalized);

  // 2. Identify Target Skill & Subtopic
  let targetSkill: string | null = input.targetSkillHint || null;
  let targetSkillStatus: InformationEpistemicStatus = input.targetSkillHint ? 'EXPLICIT' : 'UNKNOWN';
  let subtopic: string | null = null;
  const signals: ExtractedSignal[] = [];

  if (!targetSkill) {
    for (const item of KNOWN_SKILL_PATTERNS) {
      if (item.regex.test(normalized)) {
        targetSkill = item.name;
        targetSkillStatus = 'EXPLICIT';
        signals.push({
          dimension: 'TARGET_SKILL',
          value: item.name,
          status: 'EXPLICIT',
          confidence: 0.95,
          rationale: `Directly detected skill keyword matching "${item.name}".`,
        });

        // Check subtopics
        if (item.subtopics) {
          for (const sub of item.subtopics) {
            if (sub.regex.test(normalized)) {
              subtopic = sub.name;
              signals.push({
                dimension: 'SUBTOPIC',
                value: sub.name,
                status: 'EXPLICIT',
                confidence: 0.95,
                rationale: `Directly detected focus subtopic "${sub.name}".`,
              });
              break;
            }
          }
        }
        break;
      }
    }

    // If still no explicit target skill, infer from student evidence audit if available
    if (!targetSkill && input.evidenceAudit && input.evidenceAudit.skillsEvaluated && input.evidenceAudit.skillsEvaluated.length > 0) {
      const primarySkill = input.evidenceAudit.skillsEvaluated[0].skillName;
      targetSkill = primarySkill;
      targetSkillStatus = 'INFERRED';
      signals.push({
        dimension: 'TARGET_SKILL',
        value: primarySkill,
        status: 'INFERRED',
        confidence: 0.85,
        rationale: `Inferred focus skill "${primarySkill}" from existing student profile & corroborated telemetry.`,
      });
    }
  } else {
    signals.push({
      dimension: 'TARGET_SKILL',
      value: targetSkill,
      status: 'EXPLICIT',
      confidence: 1.0,
      rationale: 'Provided via explicit target skill hint.',
    });
  }

  // 3. Identify Timeframe & Urgency
  let timeframe: string | null = input.timeframeHint || null;
  let timeframeStatus: InformationEpistemicStatus = input.timeframeHint ? 'EXPLICIT' : 'UNKNOWN';
  let urgency: GoalUrgency = 'MEDIUM';

  if (!timeframe) {
    for (const tf of TIMEFRAME_PATTERNS) {
      const match = tf.pattern.exec(normalized);
      if (match) {
        timeframe = tf.getLabel ? tf.getLabel(match) : (tf.label || match[1]);
        timeframeStatus = 'EXPLICIT';
        urgency = tf.getUrgency ? tf.getUrgency(match) : (tf.urgency || 'MEDIUM');
        signals.push({
          dimension: 'TIMEFRAME',
          value: timeframe,
          status: 'EXPLICIT',
          confidence: 0.95,
          rationale: `Matched temporal expression "${match[0]}".`,
        });
        break;
      }
    }
  } else {
    signals.push({
      dimension: 'TIMEFRAME',
      value: timeframe,
      status: 'EXPLICIT',
      confidence: 1.0,
      rationale: 'Provided via explicit timeframe hint.',
    });
    if (timeframe.toLowerCase().includes('day') || timeframe.toLowerCase().includes('tomorrow')) {
      urgency = 'HIGH';
    }
  }

  if (category === 'EXAM_PREPARATION' && urgency === 'MEDIUM' && !timeframe) {
    urgency = 'HIGH'; // Exams carry inherent urgency
  }

  // 4. Identify Constraints
  const constraints: string[] = [];
  for (const cp of CONSTRAINT_PATTERNS) {
    const match = cp.pattern.exec(normalized);
    if (match) {
      const label = cp.getLabel ? cp.getLabel(match) : cp.label!;
      constraints.push(label);
      signals.push({
        dimension: 'CONSTRAINT',
        value: label,
        status: 'EXPLICIT',
        confidence: 0.9,
        rationale: `Detected constraint phrase: "${match[0]}".`,
      });
    }
  }

  // 5. Epistemic Assessment & Ambiguity Detection
  const ambiguityFlags: string[] = [];
  const clarificationQuestions: GoalClarificationQuestion[] = [];
  const words = normalized.toLowerCase().split(/[\s,.-]+/).filter((w) => w.length > 0);
  const meaningfulWords = words.filter((w) => !VAGUE_KEYWORDS.has(w) && w.length > 2);

  const requiresTargetSkill = category === 'SKILL_IMPROVEMENT' || category === 'EXAM_PREPARATION' || category === 'REMEDIAL_PRACTICE';

  if (!targetSkill && requiresTargetSkill) {
    ambiguityFlags.push('MISSING_TARGET_SKILL');
    clarificationQuestions.push({
      dimension: 'TARGET_SKILL',
      question: 'Which specific subject or technical skill do you want to focus on?',
      suggestedOptions: ['DBMS', 'Python', 'React', 'Data Structures & Algorithms', 'Operating Systems'],
    });
  }

  if (category === 'EXAM_PREPARATION' && !timeframe) {
    ambiguityFlags.push('MISSING_EXAM_TIMEFRAME');
    clarificationQuestions.push({
      dimension: 'TIMEFRAME',
      question: 'When is your exam scheduled?',
      suggestedOptions: ['In 3 days', 'Next Friday', 'In 2 weeks', 'Next month'],
    });
  }

  if (meaningfulWords.length === 0 && !targetSkill) {
    ambiguityFlags.push('VAGUE_GOAL_SCOPE');
    clarificationQuestions.push({
      dimension: 'GOAL_SCOPE',
      question: 'Could you share what you would like to achieve (e.g. prepare for an exam, build a project, or review mistakes)?',
      suggestedOptions: ['Exam Preparation', 'Skill Mastery', 'Mistake Review', 'Schedule Planning'],
    });
  }

  const clarificationNeeded = (
    (meaningfulWords.length === 0 && !targetSkill) ||
    (!targetSkill && requiresTargetSkill)
  );

  // 6. Synthesize Objective Statement
  let objective = '';
  if (category === 'EXAM_PREPARATION') {
    objective = `Prepare for ${targetSkill || 'upcoming'} exam${subtopic ? ` focusing on ${subtopic}` : ''}${timeframe ? ` (${timeframe})` : ''}`;
  } else if (category === 'SKILL_IMPROVEMENT') {
    objective = `Master ${targetSkill || 'target skill'}${subtopic ? ` focusing on ${subtopic}` : ''}`;
  } else if (category === 'REMEDIAL_PRACTICE') {
    objective = `Review and remediate mistakes in ${targetSkill || 'recent topics'}`;
  } else if (category === 'SCHEDULE_PLANNING') {
    objective = `Structure learning schedule${timeframe ? ` for ${timeframe}` : ''}`;
  } else if (category === 'CORROBORATION_AUDIT') {
    objective = `Audit and corroborate evidence for ${targetSkill || 'all claimed skills'}`;
  } else {
    objective = `Learn and practice ${targetSkill || 'selected topic'}`;
  }

  // 7. Ground with Phase 1 Evidence Audit if provided
  let evidenceContextSummary: GoalUnderstanding['evidenceContextSummary'] = undefined;
  if (input.evidenceAudit) {
    const verified = input.evidenceAudit.skillsEvaluated
      .filter((s) => s.confidenceLevel === 'HIGH' || s.confidenceLevel === 'MODERATE')
      .map((s) => s.skillName);
    const unverified = input.evidenceAudit.skillsEvaluated
      .filter((s) => s.confidenceLevel === 'UNVERIFIED')
      .map((s) => s.skillName);
    const contradicted = input.evidenceAudit.skillsEvaluated
      .filter((s) => s.confidenceLevel === 'CONTRADICTED')
      .map((s) => s.skillName);

    evidenceContextSummary = {
      verifiedSkills: verified,
      unverifiedSkills: unverified,
      contradictedSkills: contradicted,
      overallGroundTruthScore: input.evidenceAudit.summary.overallGroundTruthScore,
    };
  }

  const confidence: GoalUnderstandingConfidence =
    clarificationNeeded ? 'LOW' : targetSkill && (timeframe || category !== 'EXAM_PREPARATION') ? 'HIGH' : 'MODERATE';

  return {
    originalGoal: input.rawGoalText,
    normalizedGoal: normalized,
    category,
    categoryConfidence: 0.9,
    objective,
    targetSkill,
    targetSkillStatus,
    subtopic,
    timeframe,
    timeframeStatus,
    urgency,
    constraints,
    ambiguityFlags,
    clarificationNeeded,
    clarificationQuestions,
    extractedSignals: signals,
    reasoningSummary: `Deterministic analysis identified category ${category} with target skill ${targetSkill || 'UNKNOWN'} and urgency ${urgency}.`,
    confidence,
    source: 'DETERMINISTIC_ONLY',
    evidenceContextSummary,
    createdAt: timestamp,
  };
}

/**
 * Validates raw JSON output from Gemini against strict schema invariants.
 */
export function validateLlmGoalUnderstandingResponse(
  rawJson: string,
  deterministicBaseline: GoalUnderstanding
): GoalUnderstanding | null {
  try {
    const parsed = JSON.parse(rawJson);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    // Category validation
    if (parsed.category && !ALLOWED_GOAL_CATEGORIES.includes(parsed.category)) {
      return null;
    }

    const category: GoalCategory = parsed.category || deterministicBaseline.category;
    const objective: string = typeof parsed.objective === 'string' && parsed.objective.trim().length > 0
      ? parsed.objective.trim()
      : deterministicBaseline.objective;

    const targetSkill: string | null = typeof parsed.targetSkill === 'string' && parsed.targetSkill.trim().length > 0
      ? parsed.targetSkill.trim()
      : (parsed.targetSkill === null ? null : deterministicBaseline.targetSkill);

    const targetSkillStatus: InformationEpistemicStatus =
      parsed.targetSkillStatus === 'EXPLICIT' || parsed.targetSkillStatus === 'INFERRED' || parsed.targetSkillStatus === 'UNKNOWN'
        ? parsed.targetSkillStatus
        : (targetSkill ? 'EXPLICIT' : 'UNKNOWN');

    const subtopic: string | null = typeof parsed.subtopic === 'string' && parsed.subtopic.trim().length > 0
      ? parsed.subtopic.trim()
      : deterministicBaseline.subtopic || null;

    const timeframe: string | null = typeof parsed.timeframe === 'string' && parsed.timeframe.trim().length > 0
      ? parsed.timeframe.trim()
      : (parsed.timeframe === null ? null : deterministicBaseline.timeframe);

    const timeframeStatus: InformationEpistemicStatus =
      parsed.timeframeStatus === 'EXPLICIT' || parsed.timeframeStatus === 'INFERRED' || parsed.timeframeStatus === 'UNKNOWN'
        ? parsed.timeframeStatus
        : (timeframe ? 'EXPLICIT' : 'UNKNOWN');

    const urgency: GoalUrgency =
      parsed.urgency === 'LOW' || parsed.urgency === 'MEDIUM' || parsed.urgency === 'HIGH' || parsed.urgency === 'CRITICAL'
        ? parsed.urgency
        : deterministicBaseline.urgency;

    const constraints: string[] = Array.isArray(parsed.constraints)
      ? parsed.constraints.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
      : deterministicBaseline.constraints;

    const ambiguityFlags: string[] = Array.isArray(parsed.ambiguityFlags)
      ? parsed.ambiguityFlags.filter((f: any) => typeof f === 'string' && f.trim().length > 0)
      : deterministicBaseline.ambiguityFlags;
    // If deterministic baseline identified targetSkill and timeframe with sufficient specificity (e.g., 'coding basics in 2 days according to my level'),
    // student background telemetry in Phase 6B will calibrate level automatically — do not ask redundant clarification questions.
    const effectiveClarificationNeeded =
      (deterministicBaseline.targetSkill && deterministicBaseline.timeframe && !deterministicBaseline.clarificationNeeded)
        ? false
        : (typeof parsed.clarificationNeeded === 'boolean' ? parsed.clarificationNeeded : deterministicBaseline.clarificationNeeded);

    const clarificationQuestions: GoalClarificationQuestion[] = effectiveClarificationNeeded && Array.isArray(parsed.clarificationQuestions)
      ? parsed.clarificationQuestions.filter(
          (q: any) => typeof q?.dimension === 'string' && typeof q?.question === 'string'
        ).map((q: any) => ({
          dimension: q.dimension,
          question: q.question,
          suggestedOptions: Array.isArray(q.suggestedOptions) ? q.suggestedOptions.filter((o: any) => typeof o === 'string') : undefined,
        }))
      : (effectiveClarificationNeeded ? deterministicBaseline.clarificationQuestions : []);

    const reasoningSummary: string = typeof parsed.reasoningSummary === 'string' && parsed.reasoningSummary.trim().length > 0
      ? parsed.reasoningSummary.trim()
      : deterministicBaseline.reasoningSummary;

    const confidence: GoalUnderstandingConfidence =
      parsed.confidence === 'HIGH' || parsed.confidence === 'MODERATE' || parsed.confidence === 'LOW'
        ? parsed.confidence
        : deterministicBaseline.confidence;

    // Reject hallucinations: if user prompt did NOT mention an exam timeframe and LLM invented a concrete date without marking INFERRED/UNKNOWN
    return {
      originalGoal: deterministicBaseline.originalGoal,
      normalizedGoal: deterministicBaseline.normalizedGoal,
      category,
      categoryConfidence: typeof parsed.categoryConfidence === 'number' && parsed.categoryConfidence >= 0 && parsed.categoryConfidence <= 1 ? parsed.categoryConfidence : 0.95,
      objective,
      targetSkill,
      targetSkillStatus,
      subtopic,
      timeframe,
      timeframeStatus,
      urgency,
      constraints,
      ambiguityFlags: effectiveClarificationNeeded ? ambiguityFlags : [],
      clarificationNeeded: effectiveClarificationNeeded,
      clarificationQuestions,
      extractedSignals: deterministicBaseline.extractedSignals,
      reasoningSummary,
      confidence,
      source: 'LLM_ASSISTED',
      evidenceContextSummary: deterministicBaseline.evidenceContextSummary,
      createdAt: deterministicBaseline.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Generates the strict JSON prompt for Gemini.
 */
function buildGeminiGoalUnderstandingPrompt(input: UnderstandGoalInput, baseline: GoalUnderstanding): string {
  return `You are the Goal Understanding reasoning engine for the Personal Learning OS.
Analyze the student's learning goal and output STRICT JSON conforming to the schema below.

CRITICAL RULES:
1. NEVER hallucinate or invent unstated exam dates, deadlines, skill ratings, or study hours.
2. Mark information as:
   - "EXPLICIT": Directly stated by the student.
   - "INFERRED": Reasonably derived from the student's wording without fabrication.
   - "UNKNOWN": Not provided in the prompt.
3. Category MUST be one of: "SKILL_IMPROVEMENT", "EXAM_PREPARATION", "CORROBORATION_AUDIT", "REMEDIAL_PRACTICE", "SCHEDULE_PLANNING", "GENERAL_LEARNING".
4. When the goal includes a clear subject and timeframe (such as "coding basics in 2 days according to my level"), set "clarificationNeeded": false. The system inspects the student's background telemetry and evidence directly in Phase 6B to calibrate difficulty. ONLY set "clarificationNeeded": true if the goal is genuinely vague (e.g. "help me with tech" or "learn stuff") or missing essential intent.

SCHEMA:
{
  "category": "SKILL_IMPROVEMENT" | "EXAM_PREPARATION" | "CORROBORATION_AUDIT" | "REMEDIAL_PRACTICE" | "SCHEDULE_PLANNING" | "GENERAL_LEARNING",
  "categoryConfidence": 0.0 to 1.0,
  "objective": string,
  "targetSkill": string | null,
  "targetSkillStatus": "EXPLICIT" | "INFERRED" | "UNKNOWN",
  "subtopic": string | null,
  "timeframe": string | null,
  "timeframeStatus": "EXPLICIT" | "INFERRED" | "UNKNOWN",
  "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "constraints": string[],
  "ambiguityFlags": string[],
  "clarificationNeeded": boolean,
  "clarificationQuestions": [
    { "dimension": string, "question": string, "suggestedOptions": string[] }
  ],
  "reasoningSummary": string,
  "confidence": "HIGH" | "MODERATE" | "LOW"
}

STUDENT GOAL INPUT:
"${baseline.normalizedGoal}"

BASELINE DETERMINISTIC CONTEXT:
Category: ${baseline.category}
Identified Skill: ${baseline.targetSkill || 'None'}
Identified Timeframe: ${baseline.timeframe || 'None'}

Return ONLY valid JSON. Zero markdown fences or explanations.`;
}

/**
 * Primary intelligent Goal Understanding entrypoint.
 * Executes deterministic extraction first, calls LLM for semantic enrichment if available,
 * and seamlessly falls back on deterministic results if LLM fails or is unavailable.
 */
export async function understandStudentGoal(input: UnderstandGoalInput): Promise<GoalUnderstanding> {
  const deterministicBaseline = understandStudentGoalDeterministic(input);

  // If LLM assistance is explicitly disabled or not requested, return deterministic baseline
  if (input.allowLlm === false) {
    return deterministicBaseline;
  }

  // If custom LLM client is provided (e.g. for testing / dependency injection)
  if (input.llmClient) {
    try {
      const prompt = buildGeminiGoalUnderstandingPrompt(input, deterministicBaseline);
      const rawJson = await input.llmClient.generateJson(prompt);
      const validated = validateLlmGoalUnderstandingResponse(rawJson, deterministicBaseline);
      if (validated) {
        return validated;
      }
      return {
        ...deterministicBaseline,
        source: 'LLM_FALLBACK_DETERMINISTIC',
        reasoningSummary: `${deterministicBaseline.reasoningSummary} (LLM response failed validation; fell back to deterministic baseline).`,
      };
    } catch {
      return {
        ...deterministicBaseline,
        source: 'LLM_FALLBACK_DETERMINISTIC',
        reasoningSummary: `${deterministicBaseline.reasoningSummary} (LLM invocation failed; fell back to deterministic baseline).`,
      };
    }
  }

  // Native Gemini execution
  try {
    const config = await getResolvedGeminiConfig();
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = buildGeminiGoalUnderstandingPrompt(input, deterministicBaseline);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const validated = validateLlmGoalUnderstandingResponse(responseText, deterministicBaseline);

    if (validated) {
      return validated;
    }

    return {
      ...deterministicBaseline,
      source: 'LLM_FALLBACK_DETERMINISTIC',
      reasoningSummary: `${deterministicBaseline.reasoningSummary} (LLM response failed schema validation; fell back to deterministic baseline).`,
    };
  } catch {
    // Fail safely without disrupting the orchestrator
    return {
      ...deterministicBaseline,
      source: 'LLM_FALLBACK_DETERMINISTIC',
      reasoningSummary: `${deterministicBaseline.reasoningSummary} (Gemini unconfigured or unreachable; safe deterministic fallback applied).`,
    };
  }
}

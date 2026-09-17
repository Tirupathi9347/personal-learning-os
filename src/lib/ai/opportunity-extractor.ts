import { GoogleGenerativeAI } from '@google/generative-ai';
import { getResolvedGeminiConfig } from './gemini';
import { OpportunityType, OpportunityWorkMode } from '@/types';

export interface ExtractedOpportunityItem {
  title: string;
  organization: string;
  type: OpportunityType;
  role?: string | null;
  description?: string | null;
  eligibility?: string | null;
  education_requirements?: string | null;
  branch_requirements?: string | null;
  skills_required?: string[] | null;
  location?: string | null;
  work_mode?: OpportunityWorkMode | null;
  stipend?: string | null;
  salary?: string | null;
  deadline?: string | null;
  application_url?: string | null;
  confidence: number;
  evidence_snippet?: string | null;
  source_identifier?: string | null;
}

export interface ExtractionResult {
  opportunities: ExtractedOpportunityItem[];
  rawTextPreview: string;
  sourceType: 'PDF' | 'DOCX' | 'DOC' | 'TXT' | 'WHATSAPP_EXPORT' | 'GMAIL' | 'DOCUMENT';
  fileName?: string;
}

const OPPORTUNITY_EXTRACTION_SYSTEM_PROMPT = `
You are an expert Opportunity Intelligence AI parser.
Your task is to analyze document text, job descriptions, flyers, or exported WhatsApp chat logs to detect and extract real-world opportunities for students.

Extracted opportunities can be:
- INTERNSHIP
- JOB
- HACKATHON
- SCHOLARSHIP
- FELLOWSHIP
- COMPETITION
- WORKSHOP
- CERTIFICATION
- RESEARCH
- OTHER

CRITICAL CONSTRAINTS & RULES:
1. NEVER INVENT OR HALLUCINATE MISSING INFORMATION.
2. If a field is not explicitly supported by the source text, store null. Do NOT guess or infer missing facts.
3. For "evidence_snippet", provide a concise 1-2 sentence verbatim or relevant quote from the source text that triggered detection.
4. For "source_identifier", if in a chat log, reference the message sender or timestamp header (e.g. "[12/05/25, 10:30 AM] John").
5. CONFIDENCE SCORING (Deterministic):
   - 0.90 to 1.00: Strong verified opportunity evidence with title, organization, type, and 3+ major fields (deadline/stipend/skills/url/eligibility).
   - 0.70 to 0.89: Clear opportunity but several secondary fields missing.
   - 0.50 to 0.69: Partial/weak or uncertain opportunity (containing phrases like "apparently", "might", "I heard", "not sure", "unofficial", "no official posting", "rumor") requiring careful review.
6. Work Mode must strictly be one of: 'REMOTE', 'HYBRID', 'ON_SITE', or null.
7. Type must strictly be one of: 'INTERNSHIP', 'JOB', 'HACKATHON', 'SCHOLARSHIP', 'FELLOWSHIP', 'COMPETITION', 'WORKSHOP', 'CERTIFICATION', 'RESEARCH', 'OTHER'.
8. Deadlines must be ISO YYYY-MM-DD format if explicitly stated, or null.

Return ONLY a valid JSON object matching this schema:
{
  "opportunities": [
    {
      "title": "string (required)",
      "organization": "string (required)",
      "type": "INTERNSHIP|JOB|HACKATHON|SCHOLARSHIP|FELLOWSHIP|COMPETITION|WORKSHOP|CERTIFICATION|RESEARCH|OTHER",
      "role": "string or null",
      "description": "string or null",
      "eligibility": "string or null",
      "education_requirements": "string or null",
      "branch_requirements": "string or null",
      "skills_required": ["array of strings"] or null,
      "location": "string or null",
      "work_mode": "REMOTE|HYBRID|ON_SITE or null",
      "stipend": "string or null",
      "salary": "string or null",
      "deadline": "YYYY-MM-DD or null",
      "application_url": "string (URL) or null",
      "evidence_snippet": "string (1-2 sentence source snippet) or null",
      "source_identifier": "string or null",
      "confidence": number (0.50 to 1.00)
    }
  ]
}
`;

/**
 * Validates and normalizes raw AI extraction items against the domain model.
 * Deterministically adjusts confidence scores based on supported evidence fields and language certainty.
 */
function validateAndNormalizeOpportunity(item: any): ExtractedOpportunityItem | null {
  if (!item || typeof item !== 'object') return null;

  const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
  const rawOrg = typeof item.organization === 'string' ? item.organization.trim() : '';

  // Reject malformed AI outputs missing required title or organization
  if (!rawTitle || !rawOrg || rawTitle.toLowerCase() === 'null' || rawOrg.toLowerCase() === 'null') {
    return null;
  }

  const validTypes: OpportunityType[] = [
    'INTERNSHIP', 'JOB', 'HACKATHON', 'SCHOLARSHIP', 'FELLOWSHIP',
    'COMPETITION', 'WORKSHOP', 'CERTIFICATION', 'RESEARCH', 'OTHER'
  ];
  const type: OpportunityType = validTypes.includes(item.type) ? item.type : 'OTHER';

  const validWorkModes: OpportunityWorkMode[] = ['REMOTE', 'HYBRID', 'ON_SITE'];
  const work_mode: OpportunityWorkMode | null = validWorkModes.includes(item.work_mode) ? item.work_mode : null;

  const role = item.role && typeof item.role === 'string' ? item.role.trim() : null;
  const description = item.description && typeof item.description === 'string' ? item.description.trim() : null;
  const eligibility = item.eligibility && typeof item.eligibility === 'string' ? item.eligibility.trim() : null;
  const education_requirements = item.education_requirements && typeof item.education_requirements === 'string' ? item.education_requirements.trim() : null;
  const branch_requirements = item.branch_requirements && typeof item.branch_requirements === 'string' ? item.branch_requirements.trim() : null;
  const skills_required = Array.isArray(item.skills_required) ? item.skills_required.map((s: any) => String(s).trim()).filter(Boolean) : null;
  const location = item.location && typeof item.location === 'string' ? item.location.trim() : null;
  const stipend = item.stipend && typeof item.stipend === 'string' ? item.stipend.trim() : null;
  const salary = item.salary && typeof item.salary === 'string' ? item.salary.trim() : null;
  const deadline = item.deadline && /^\d{4}-\d{2}-\d{2}$/.test(String(item.deadline).trim()) ? String(item.deadline).trim() : null;
  const application_url = item.application_url && typeof item.application_url === 'string' && item.application_url.startsWith('http') ? item.application_url.trim() : null;
  const evidence_snippet = item.evidence_snippet && typeof item.evidence_snippet === 'string' ? item.evidence_snippet.trim() : null;
  const source_identifier = item.source_identifier && typeof item.source_identifier === 'string' ? item.source_identifier.trim() : null;

  // Scan text for uncertain/unverified language indicators
  const textToScan = `${rawTitle} ${rawOrg} ${description || ''} ${evidence_snippet || ''}`.toLowerCase();
  const uncertainKeywords = [
    'apparently',
    'might',
    'some internship',
    'i heard',
    'heard that',
    'not sure',
    'unofficial',
    'no official posting',
    'rumor',
    'tentative',
    'unverified',
    'maybe',
    'supposedly'
  ];

  const hasUncertainLanguage = uncertainKeywords.some((kw) => textToScan.includes(kw));

  // Count populated evidence fields for deterministic confidence calculation
  const primaryFields = [role, eligibility, skills_required, stipend, salary, deadline, application_url, location].filter(Boolean).length;

  let confidence = typeof item.confidence === 'number' ? item.confidence : 0.85;

  if (hasUncertainLanguage) {
    // Force lower confidence (< 0.70) for unverified / speculative language
    confidence = Math.min(0.65, Math.max(0.52, confidence > 0.65 ? 0.62 : confidence));
  } else if (primaryFields >= 4 && evidence_snippet) {
    confidence = Math.max(0.90, Math.min(0.98, confidence));
  } else if (primaryFields >= 2) {
    confidence = Math.max(0.72, Math.min(0.89, confidence));
  } else {
    confidence = Math.max(0.55, Math.min(0.69, confidence));
  }

  return {
    title: rawTitle,
    organization: rawOrg,
    type,
    role,
    description,
    eligibility,
    education_requirements,
    branch_requirements,
    skills_required: skills_required && skills_required.length > 0 ? skills_required : null,
    location,
    work_mode,
    stipend,
    salary,
    deadline,
    application_url,
    evidence_snippet,
    source_identifier,
    confidence: Number(confidence.toFixed(2)),
  };
}

/**
 * Extract structured opportunities from raw text or document content using Gemini.
 */
export async function extractOpportunitiesFromText(
  text: string,
  fileName: string,
  sourceType: 'PDF' | 'DOCX' | 'DOC' | 'TXT' | 'WHATSAPP_EXPORT' | 'GMAIL' | 'DOCUMENT'
): Promise<ExtractionResult> {
  const config = await getResolvedGeminiConfig();
  const genAI = new GoogleGenerativeAI(config.apiKey);

  const model = genAI.getGenerativeModel({
    model: config.modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const isWhatsApp = sourceType === 'WHATSAPP_EXPORT' || text.includes('] ') || text.includes(' - ');

  const promptText = `
${OPPORTUNITY_EXTRACTION_SYSTEM_PROMPT}

Document Name: "${fileName}"
Document Type: ${isWhatsApp ? 'WhatsApp Exported Chat Log' : sourceType}

Content to Analyze:
"""
${text.substring(0, 15000)}
"""
  `;

  const result = await model.generateContent(promptText);
  const responseText = result.response.text();

  try {
    const parsed = JSON.parse(responseText);
    const rawList = Array.isArray(parsed.opportunities) ? parsed.opportunities : [];

    const validItems: ExtractedOpportunityItem[] = [];
    for (const rawItem of rawList) {
      const normalized = validateAndNormalizeOpportunity(rawItem);
      if (normalized) {
        validItems.push(normalized);
      }
    }

    return {
      opportunities: validItems,
      rawTextPreview: text.substring(0, 300),
      sourceType: isWhatsApp ? 'WHATSAPP_EXPORT' : sourceType,
      fileName,
    };
  } catch (err) {
    throw new Error(`Failed to parse Gemini opportunity extraction output: ${responseText}`);
  }
}

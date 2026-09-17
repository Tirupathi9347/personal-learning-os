import { Opportunity, DuplicateMatchResult, DuplicateMatchLevel } from '@/types';

/**
 * Normalize Organization string:
 * Strips common corporate suffixes, punctuation, and extra whitespace.
 * Example: "Google LLC", "Google Inc." -> "google"
 */
export function normalizeOrganization(org: string | null | undefined): string {
  if (!org) return '';
  let str = org.toLowerCase().trim();
  str = str.replace(/[^a-z0-9\s]/g, ' ');
  const corporateSuffixes = ['llc', 'inc', 'corp', 'corporation', 'ltd', 'limited', 'pvt', 'private', 'technologies', 'labs', 'solutions'];
  const words = str.split(/\s+/).filter((w) => w && !corporateSuffixes.includes(w));
  return words.join(' ').trim();
}

/**
 * Normalize Title string:
 * Strips noise words (hiring, urgent, 2025, 2026), punctuation, and extra whitespace.
 * Example: "Software Engineer Intern 2025 (Hiring)" -> "software engineer intern"
 */
export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return '';
  let str = title.toLowerCase().trim();
  str = str.replace(/[^a-z0-9\s]/g, ' ');
  const noiseWords = ['hiring', 'urgent', 'opening', 'role', 'recruitment', '2024', '2025', '2026', 'apply', 'now', 'opportunity'];
  const words = str.split(/\s+/).filter((w) => w && !noiseWords.includes(w));
  return words.join(' ').trim();
}

/**
 * Normalize Application URL:
 * Strips http/https, www, trailing slashes, and tracking query params (?utm=...).
 * Example: "https://www.google.com/jobs/123?utm_source=linkedin/" -> "google.com/jobs/123"
 */
export function normalizeUrl(urlStr: string | null | undefined): string {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.startsWith('http')) return '';
  try {
    const parsed = new URL(urlStr);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = parsed.pathname.replace(/\/+$/, '');
    return `${host}${pathname}`;
  } catch (err) {
    return urlStr.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').split('?')[0];
  }
}

/**
 * Calculate Jaccard similarity between two normalized strings (0.0 to 1.0).
 */
export function calculateTextSimilarity(strA: string, strB: string): number {
  if (!strA || !strB) return 0;
  if (strA === strB) return 1.0;

  const setA = new Set(strA.split(/\s+/).filter((w) => w.length > 1));
  const setB = new Set(strB.split(/\s+/).filter((w) => w.length > 1));

  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Evaluate if a candidate opportunity matches an existing opportunity record.
 */
export function findBestDuplicateMatch(
  candidate: Partial<Opportunity>,
  existingRecords: Opportunity[]
): DuplicateMatchResult {
  if (!existingRecords || existingRecords.length === 0) {
    return { matchLevel: 'NO_MATCH', matchedOpportunity: null, matchScore: 0, matchReason: 'No existing records.' };
  }

  const candNormOrg = normalizeOrganization(candidate.organization);
  const candNormTitle = normalizeTitle(candidate.title);
  const candNormUrl = normalizeUrl(candidate.application_url);

  let bestMatch: Opportunity | null = null;
  let highestScore = 0;
  let highestLevel: DuplicateMatchLevel = 'NO_MATCH';
  let bestReason = 'No match found.';

  for (const existing of existingRecords) {
    const existNormOrg = normalizeOrganization(existing.organization);
    const existNormTitle = normalizeTitle(existing.title);
    const existNormUrl = normalizeUrl(existing.application_url);

    // Rule 1: Exact Application URL Match
    if (candNormUrl && existNormUrl && candNormUrl === existNormUrl) {
      return {
        matchLevel: 'EXACT_MATCH',
        matchedOpportunity: existing,
        matchScore: 0.98,
        matchReason: `Exact application URL match: ${candNormUrl}`,
      };
    }

    // Rule 2: Same Organization + Exact Normalized Title Match
    if (candNormOrg && existNormOrg && candNormOrg === existNormOrg) {
      if (candNormTitle && existNormTitle && candNormTitle === existNormTitle) {
        return {
          matchLevel: 'EXACT_MATCH',
          matchedOpportunity: existing,
          matchScore: 0.95,
          matchReason: `Exact organization (${existing.organization}) and title (${existing.title}) match.`,
        };
      }

      // Calculate title similarity for same company
      const titleSim = calculateTextSimilarity(candNormTitle, existNormTitle);

      // Same Org + High Title Similarity (> 0.70)
      if (titleSim >= 0.70) {
        const sameDeadline = candidate.deadline && existing.deadline && candidate.deadline === existing.deadline;
        const sameWorkMode = candidate.work_mode && existing.work_mode && candidate.work_mode === existing.work_mode;

        if (sameDeadline || sameWorkMode || titleSim >= 0.85) {
          if (0.85 > highestScore) {
            highestScore = 0.85;
            highestLevel = 'STRONG_MATCH';
            bestMatch = existing;
            bestReason = `Strong match: ${existing.organization} - ${existing.title} (Title similarity: ${Math.round(titleSim * 100)}%)`;
          }
        } else {
          // Different deadline or skills -> Possible duplicate for review
          if (0.65 > highestScore) {
            highestScore = 0.65;
            highestLevel = 'POSSIBLE_DUPLICATE';
            bestMatch = existing;
            bestReason = `Possible duplicate: Same company (${existing.organization}), similar title (${existing.title}), but differing deadline/details.`;
          }
        }
      }
    }
  }

  if (highestScore > 0 && bestMatch) {
    return {
      matchLevel: highestLevel,
      matchedOpportunity: bestMatch,
      matchScore: highestScore,
      matchReason: bestReason,
    };
  }

  return {
    matchLevel: 'NO_MATCH',
    matchedOpportunity: null,
    matchScore: 0,
    matchReason: 'Distinct opportunity record.',
  };
}

import { Opportunity, StudentProfile } from '@/types';

export type MatchTier = 'STRONG' | 'GOOD' | 'PARTIAL' | 'LOW';

export interface OpportunityMatchResult {
  opportunityId: string;
  score: number; // 0 - 100
  tier: MatchTier;
  matchedReasons: string[];
  missingRequirements: string[];
  skillsOverlap: string[];
  missingSkills: string[];
}

/**
 * Deterministic and Explainable Match Engine for Opportunity Intelligence.
 * Evaluates student profile data against opportunity requirements.
 */
export function calculateOpportunityMatch(
  opportunity: Opportunity,
  profile: StudentProfile | null
): OpportunityMatchResult {
  const result: OpportunityMatchResult = {
    opportunityId: opportunity.id,
    score: 50, // Default neutral score if no profile available
    tier: 'PARTIAL',
    matchedReasons: [],
    missingRequirements: [],
    skillsOverlap: [],
    missingSkills: [],
  };

  if (!profile) {
    result.matchedReasons.push('Profile unpopulated. Complete your Student Profile for personalized matching.');
    return result;
  }

  let totalScore = 0;

  // 1. Skill & Technology Match (Weight: 35 points)
  const userSkillsSet = new Set(
    [
      ...(profile.skills || []),
      ...(profile.relevant_project_technologies || []),
    ].map((s) => s.toLowerCase().trim())
  );

  const requiredSkills = opportunity.skills_required || [];
  if (requiredSkills.length > 0) {
    const matched: string[] = [];
    const missing: string[] = [];

    requiredSkills.forEach((skillStr) => {
      const lower = skillStr.toLowerCase().trim();
      let isFound = userSkillsSet.has(lower);
      if (!isFound) {
        // Partial substring search check (e.g. "React.js" vs "React")
        isFound = Array.from(userSkillsSet).some(
          (u) => u.includes(lower) || lower.includes(u)
        );
      }

      if (isFound) {
        matched.push(skillStr);
      } else {
        missing.push(skillStr);
      }
    });

    result.skillsOverlap = matched;
    result.missingSkills = missing;

    const skillMatchRatio = matched.length / requiredSkills.length;
    const skillScore = Math.round(skillMatchRatio * 35);
    totalScore += skillScore;

    if (matched.length > 0) {
      result.matchedReasons.push(`Skills overlap (${matched.length}/${requiredSkills.length}): ${matched.join(', ')}`);
    }
    if (missing.length > 0) {
      result.missingRequirements.push(`Missing skills (${missing.length}): ${missing.join(', ')}`);
    }
  } else {
    // If no explicit required skills listed in opportunity, check description text overlap
    const descText = `${opportunity.title} ${opportunity.description || ''}`.toLowerCase();
    const matchedFromDesc = (profile.skills || []).filter((s) =>
      descText.includes(s.toLowerCase())
    );

    if (matchedFromDesc.length > 0) {
      totalScore += Math.min(35, 15 + matchedFromDesc.length * 5);
      result.skillsOverlap = matchedFromDesc;
      result.matchedReasons.push(`Skills relevant to role: ${matchedFromDesc.join(', ')}`);
    } else {
      totalScore += 20; // Default baseline when no skills specified
      result.matchedReasons.push('No explicit skills required by opportunity');
    }
  }

  // 2. Branch & Academic Eligibility Match (Weight: 20 points)
  const studentBranch = (profile.branch || '').toLowerCase();
  const studentDegree = (profile.degree || '').toLowerCase();
  const branchReq = (opportunity.branch_requirements || '').toLowerCase();
  const eduReq = (opportunity.education_requirements || '').toLowerCase();
  const eligibility = (opportunity.eligibility || '').toLowerCase();

  const combinedReqText = `${branchReq} ${eduReq} ${eligibility}`.trim();

  if (combinedReqText) {
    let branchMatched = false;
    let branchConflict = false;

    if (studentBranch && (combinedReqText.includes(studentBranch) || combinedReqText.includes('all branch') || combinedReqText.includes('any branch') || combinedReqText.includes('engineering') || combinedReqText.includes('cs') || combinedReqText.includes('computer'))) {
      branchMatched = true;
    }

    if (studentDegree && combinedReqText.includes(studentDegree)) {
      branchMatched = true;
    }

    if (branchMatched) {
      totalScore += 20;
      result.matchedReasons.push(`Matches academic requirements (${profile.branch || profile.degree})`);
    } else {
      totalScore += 10;
      result.missingRequirements.push(`Academic criteria specify: ${opportunity.branch_requirements || opportunity.education_requirements || opportunity.eligibility}`);
    }
  } else {
    totalScore += 20;
    result.matchedReasons.push('No academic branch restrictions');
  }

  // 3. Preferred Opportunity Type & Work Mode Match (Weight: 20 points)
  const prefTypes = (profile.preferred_opportunity_types || []).map((t) => t.toUpperCase());
  if (prefTypes.length > 0 && prefTypes.includes(opportunity.type.toUpperCase())) {
    totalScore += 10;
    result.matchedReasons.push(`Preferred opportunity type: ${opportunity.type}`);
  } else if (prefTypes.length === 0) {
    totalScore += 8;
  } else {
    totalScore += 3;
    result.missingRequirements.push(`Opportunity type is ${opportunity.type} (Preferred: ${prefTypes.join(', ')})`);
  }

  const prefModes = (profile.preferred_work_modes || []).map((m) => m.toUpperCase());
  const oppMode = (opportunity.work_mode || '').toUpperCase();
  if (oppMode && prefModes.includes(oppMode)) {
    totalScore += 10;
    result.matchedReasons.push(`Preferred work mode: ${opportunity.work_mode}`);
  } else if (oppMode === 'REMOTE' || prefModes.includes('REMOTE')) {
    totalScore += 8;
    result.matchedReasons.push('Remote friendly role');
  } else if (!oppMode) {
    totalScore += 7;
  } else {
    totalScore += 4;
  }

  // 4. Location Match (Weight: 10 points)
  const prefLocations = (profile.preferred_locations || []).map((l) => l.toLowerCase());
  const oppLoc = (opportunity.location || '').toLowerCase();

  if (oppMode === 'REMOTE' || (oppLoc && prefLocations.some((loc) => oppLoc.includes(loc) || loc.includes(oppLoc)))) {
    totalScore += 10;
    result.matchedReasons.push(`Location matches preferences (${opportunity.location || 'Remote'})`);
  } else if (!oppLoc) {
    totalScore += 7;
  } else if (prefLocations.length > 0) {
    totalScore += 3;
  } else {
    totalScore += 7;
  }

  // 5. Interests & Target Roles Alignment (Weight: 15 points)
  const targetRoles = (profile.career_target_roles || []).map((r) => r.toLowerCase());
  const interests = (profile.interests || []).map((i) => i.toLowerCase());
  const oppTitle = opportunity.title.toLowerCase();
  const oppRole = (opportunity.role || '').toLowerCase();

  const roleMatched = targetRoles.some(
    (tr) => oppTitle.includes(tr) || oppRole.includes(tr) || tr.includes(oppTitle)
  );

  const interestMatched = interests.some(
    (interest) => oppTitle.includes(interest) || (opportunity.description || '').toLowerCase().includes(interest)
  );

  if (roleMatched) {
    totalScore += 15;
    result.matchedReasons.push(`Aligns with target role: ${opportunity.title}`);
  } else if (interestMatched) {
    totalScore += 12;
    result.matchedReasons.push('Aligns with your technical interests');
  } else {
    totalScore += 8;
  }

  // Final score normalized to 0-100
  const finalScore = Math.min(100, Math.max(0, Math.round(totalScore)));
  result.score = finalScore;

  if (finalScore >= 80) {
    result.tier = 'STRONG';
  } else if (finalScore >= 65) {
    result.tier = 'GOOD';
  } else if (finalScore >= 45) {
    result.tier = 'PARTIAL';
  } else {
    result.tier = 'LOW';
  }

  return result;
}

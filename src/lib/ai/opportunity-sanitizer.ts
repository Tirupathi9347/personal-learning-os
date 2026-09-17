const VALID_TYPES = [
  'INTERNSHIP', 'JOB', 'HACKATHON', 'SCHOLARSHIP', 'FELLOWSHIP',
  'COMPETITION', 'WORKSHOP', 'CERTIFICATION', 'RESEARCH', 'OTHER'
];

const VALID_WORK_MODES = ['REMOTE', 'HYBRID', 'ON_SITE'];

/**
 * Normalizes raw/extracted opportunity type strings to valid uppercase schema enums.
 */
export function sanitizeOpportunityType(typeStr?: string | null): string {
  if (!typeStr) return 'OTHER';
  const u = typeStr.toUpperCase().trim();
  if (VALID_TYPES.includes(u)) return u;
  if (u.includes('INTERN')) return 'INTERNSHIP';
  if (u.includes('JOB') || u.includes('FULL') || u.includes('PART')) return 'JOB';
  if (u.includes('HACK')) return 'HACKATHON';
  if (u.includes('SCHOLAR')) return 'SCHOLARSHIP';
  if (u.includes('FELLOW')) return 'FELLOWSHIP';
  if (u.includes('COMPET')) return 'COMPETITION';
  if (u.includes('WORKSHOP')) return 'WORKSHOP';
  if (u.includes('CERT')) return 'CERTIFICATION';
  if (u.includes('RESEARCH')) return 'RESEARCH';
  return 'OTHER';
}

/**
 * Normalizes raw/extracted work mode strings to valid uppercase schema enums.
 */
export function sanitizeWorkMode(modeStr?: string | null): string | null {
  if (!modeStr) return null;
  const u = modeStr.toUpperCase().trim().replace('-', '_').replace(' ', '_');
  if (VALID_WORK_MODES.includes(u)) return u;
  if (u.includes('REMOTE')) return 'REMOTE';
  if (u.includes('HYBRID')) return 'HYBRID';
  if (u.includes('SITE') || u.includes('OFFICE') || u.includes('LOCATION')) return 'ON_SITE';
  return null;
}

/**
 * Normalizes raw/extracted deadline date strings to valid ISO YYYY-MM-DD format or null.
 */
export function sanitizeDeadline(dateStr?: string | null): string | null {
  if (!dateStr || dateStr.trim() === '' || dateStr.toLowerCase().includes('specified') || dateStr.toLowerCase().includes('unknown')) {
    return null;
  }
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
}

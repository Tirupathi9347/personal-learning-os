import { getOpportunities } from '@/app/actions/opportunity-actions';
import { OpportunitiesClient } from '@/components/opportunities/opportunities-client';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const initialOpportunities = await getOpportunities();

  return <OpportunitiesClient initialOpportunities={initialOpportunities} />;
}

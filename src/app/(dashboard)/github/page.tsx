import { getSyncedGitHubRepos, getSyncedGitHubActivity } from '@/app/actions/github-actions';
import { GitHubClient } from '@/components/github/github-client';

export default async function GitHubPage() {
  const [repos, activities] = await Promise.all([
    getSyncedGitHubRepos(),
    getSyncedGitHubActivity(),
  ]);

  return <GitHubClient initialRepos={repos} initialActivities={activities} />;
}

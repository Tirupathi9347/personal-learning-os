import { getStudentProfile } from '@/app/actions/profile-actions';
import { ProfileClient } from '@/components/profile/profile-client';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const profile = await getStudentProfile();

  return <ProfileClient initialProfile={profile} />;
}

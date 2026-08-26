import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/supabase-auth';
import HomeEntry from '@/components/home-entry';
import { getChaoxingLoginOptions } from '@/lib/chaoxing-client';

export default async function Home() {
  const options = getChaoxingLoginOptions();
  if (process.env.ENABLE_UI_PREVIEW === 'true') {
    return <HomeEntry demo options={options} />;
  }
  const session = await getSessionUser(await cookies());
  if (!session) {
    return (
      <HomeEntry
        demo={process.env.ENABLE_DEMO_ACCESS === 'true'}
        options={options}
      />
    );
  }
  return (
    <HomeEntry
      demo={false}
      authenticated
      displayName={session.user.profile.displayName}
      defaultWorkspace={session.user.defaultWorkspace}
      options={options}
    />
  );
}

import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/supabase-auth';
import HomeEntry from '@/components/home-entry';
import { getIntegrationStatus } from '@/lib/integration-status';

export default async function Home() {
  const integrations = getIntegrationStatus();
  if (process.env.ENABLE_UI_PREVIEW === 'true') {
    return <HomeEntry demo chaoxing={false} integrations={integrations} />;
  }
  const session = await getSessionUser(await cookies());
  if (!session) {
    return (
      <HomeEntry
        demo={process.env.ENABLE_DEMO_ACCESS === 'true'}
        chaoxing={process.env.ENABLE_CHAOXING_AUTH === 'true'}
        integrations={integrations}
      />
    );
  }
  return (
    <HomeEntry
      demo={false}
      chaoxing={process.env.ENABLE_CHAOXING_AUTH === 'true'}
      authenticated
      displayName={session.user.profile.displayName}
      defaultWorkspace={session.user.defaultWorkspace}
      integrations={integrations}
    />
  );
}

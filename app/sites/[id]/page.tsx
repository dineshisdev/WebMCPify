import { SiteDashboard } from '@/app/components/SiteDashboard';
import { headers } from 'next/headers';

export default async function SitePage({ params }: PageProps<'/sites/[id]'>) {
  const { id } = await params;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, '') || `${proto}://${host}`;
  const workerOrigin = (process.env.WORKER_ORIGIN || 'http://localhost:8787').replace(/\/$/, '');
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <SiteDashboard id={id} workerOrigin={workerOrigin} appOrigin={appOrigin} />
    </div>
  );
}

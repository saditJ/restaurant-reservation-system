import WaitlistClient from './waitlist-client';

const ENABLED =
  process.env.WAITLIST_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_WAITLIST_ENABLED === 'true';

export default function WaitlistPage() {
  return (
    <main className="bg-slate-50 min-h-screen">
      <WaitlistClient enabled={ENABLED} />
    </main>
  );
}

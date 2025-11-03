import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { convertWaitlistOffer, createReservation, isApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

type OfferSuccess = {
  status: 'ok';
  data: OfferResponse;
};

type OfferExpired = { status: 'expired' };

type OfferMissing = { status: 'missing' };

type OfferResult = OfferSuccess | OfferExpired | OfferMissing;

type OfferResponse = {
  waitlistId: string;
  holdId: string;
  venueId: string;
  partySize: number;
  startAt: string;
  slotLocalDate: string;
  slotLocalTime: string;
  expiresAt: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
};

type PageProps = {
  params: { code: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

async function fetchOffer(code: string, token: string): Promise<OfferResult> {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? 'localhost:3002';
  const proto = hdrs.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const origin = `${proto}://${host}`;
  const url = `${origin}/api/waitlist/offer/${encodeURIComponent(code)}?token=${encodeURIComponent(
    token,
  )}`;
  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (response.status === 410) {
    return { status: 'expired' };
  }
  if (response.status === 404) {
    return { status: 'missing' };
  }
  if (!response.ok) {
    throw new Error(`Failed to load offer (${response.status})`);
  }
  const data = (await response.json()) as OfferResponse;
  return { status: 'ok', data };
}

export default async function WaitlistOfferPage({ params, searchParams }: PageProps) {
  const code = decodeURIComponent(params.code || '').trim();
  if (!code) {
    return renderMessage('Offer not found', 'We could not locate this invitation. Please check the link in your email.');
  }

  const tokenParam = Array.isArray(searchParams?.token)
    ? searchParams?.token[searchParams.token.length - 1]
    : searchParams?.token;
  const token = typeof tokenParam === 'string' ? tokenParam.trim() : '';
  if (!token) {
    return renderMessage(
      'Offer not found',
      'We could not locate this invitation. Please check the link in your email.',
    );
  }

  const offer = await fetchOffer(code, token);
  const confirmed = searchParams?.confirmed === '1';
  const errorKey = typeof searchParams?.error === 'string' ? searchParams?.error : null;

  async function confirmReservation(formData: FormData) {
    'use server';
    const holdId = formData.get('holdId');
    const waitlistCode = formData.get('code');
    const guestName = String(formData.get('guestName') ?? '').trim() || 'Guest';
    const guestEmailRaw = formData.get('guestEmail');
    const guestPhoneRaw = formData.get('guestPhone');

    if (typeof holdId !== 'string' || holdId.length === 0 || typeof waitlistCode !== 'string') {
      throw new Error('Invalid offer submission');
    }

    const guestEmail = typeof guestEmailRaw === 'string' && guestEmailRaw.trim().length > 0
      ? guestEmailRaw.trim()
      : null;
    const guestPhone = typeof guestPhoneRaw === 'string' && guestPhoneRaw.trim().length > 0
      ? guestPhoneRaw.trim()
      : null;

    try {
      await createReservation(
        {
          holdId,
          guestName,
          guestPhone,
          guestEmail,
          channel: 'waitlist-offer',
          createdBy: 'waitlist-offer',
        },
        { idempotencyKey: randomUUID() },
      );
      try {
        await convertWaitlistOffer(waitlistCode, token);
      } catch (conversionError) {
        console.warn(
          `Failed to convert waitlist offer ${waitlistCode}:`,
          conversionError,
        );
      }
    } catch (error) {
      const reason = isApiError(error) ? error.message : 'Reservation could not be created';
      redirect(
        `/r/${encodeURIComponent(waitlistCode)}?error=${encodeURIComponent(reason)}&token=${encodeURIComponent(
          token,
        )}`,
      );
    }

    redirect(
      `/r/${encodeURIComponent(waitlistCode)}?confirmed=1&token=${encodeURIComponent(token)}`,
    );
  }

  if (offer.status === 'expired') {
    if (confirmed) {
      return renderMessage(
        'Reservation confirmed',
        'Your reservation is confirmed. We look forward to hosting you!',
      );
    }
    return renderMessage(
      'Offer expired',
      'This offer has expired. Please contact the venue if you still wish to book.',
    );
  }

  if (offer.status === 'missing') {
    return renderMessage('Offer not found', 'We could not locate this invitation. Please check the link in your email.');
  }

  const { data } = offer;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Confirm Your Table</h1>
        <p className="text-sm text-gray-600">
          We held a table for your party of {data.partySize} on {formatDate(data.slotLocalDate)} at {data.slotLocalTime}.
        </p>
      </header>

      {confirmed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Reservation confirmed! Check your email for details.
        </div>
      )}
      {errorKey && !confirmed && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorKey}
        </div>
      )}

      {!confirmed && (
        <form action={confirmReservation} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <input type="hidden" name="holdId" value={data.holdId} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="guestName" value={data.guestName} />
          <input type="hidden" name="guestEmail" value={data.guestEmail ?? ''} />
          <input type="hidden" name="guestPhone" value={data.guestPhone ?? ''} />
          <input type="hidden" name="token" value={token} />

          <dl className="space-y-3 text-sm text-gray-700">
            <div className="flex justify-between">
              <dt className="font-medium text-gray-500">Party size</dt>
              <dd className="font-semibold text-gray-900">{data.partySize}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium text-gray-500">Date</dt>
              <dd className="font-semibold text-gray-900">{formatDate(data.slotLocalDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium text-gray-500">Time</dt>
              <dd className="font-semibold text-gray-900">{data.slotLocalTime}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium text-gray-500">Hold expires</dt>
              <dd className="font-semibold text-gray-900">{formatRelativeExpiry(data.expiresAt)}</dd>
            </div>
          </dl>

          <button
            type="submit"
            className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 focus:outline-none focus-visible:ring focus-visible:ring-black/50"
          >
            Confirm reservation
          </button>
        </form>
      )}
    </div>
  );
}

function renderMessage(title: string, message: string) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatRelativeExpiry(value: string) {
  const expires = new Date(value);
  const diffMs = expires.getTime() - Date.now();
  if (!Number.isFinite(diffMs)) {
    return 'Unknown';
  }
  if (diffMs <= 0) {
    return 'Expired';
  }
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes <= 1) {
    return 'in less than a minute';
  }
  return `in ${minutes} minutes`;
}

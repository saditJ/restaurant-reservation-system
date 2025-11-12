import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;

  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    const response = await fetch(`${apiUrl}/v1/reservations/by-code/${code}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Reservation not found' },
          { status: 404 }
        );
      }
      throw new Error(`API responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching reservation by code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reservation' },
      { status: 500 }
    );
  }
}

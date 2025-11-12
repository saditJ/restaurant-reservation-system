import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ venueId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { venueId } = await context.params;

  if (!venueId) {
    return NextResponse.json({ error: 'Venue ID is required' }, { status: 400 });
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    const response = await fetch(`${apiUrl}/v1/venues/${venueId}/settings`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Venue not found' },
          { status: 404 }
        );
      }
      throw new Error(`API responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching venue settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch venue settings' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { apiPost } from '../../../../src/lib/api';
import type { OnboardingVenueResponse } from '../../../../src/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await apiPost<OnboardingVenueResponse>(
      '/v1/provider/onboarding/venue',
      body,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

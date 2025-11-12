import { NextResponse } from 'next/server';
import { apiPost } from '../../../../src/lib/api';
import type { OnboardingTenantResponse } from '../../../../src/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await apiPost<OnboardingTenantResponse>(
      '/v1/provider/onboarding/tenant',
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

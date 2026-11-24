import { NextResponse } from 'next/server';
import { isAdminIdentity } from '../../../../lib/admin';
import { user } from '../../../../lib/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const identity = await user(request);
    return NextResponse.json(
      { eligible: isAdminIdentity(identity) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { eligible: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

import { NextResponse } from 'next/server';
import { AppError } from '@tikquick/shared';
import {
  loadAdminPackOrders,
  loadAdminUsers,
  requireAdmin,
} from '../../../../lib/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [directory, packs] = await Promise.all([
      loadAdminUsers(),
      loadAdminPackOrders(),
    ]);
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        summary: directory.summary,
        users: directory.users,
        packs,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const error =
      e instanceof AppError
        ? e
        : new AppError(
            'INTERNAL_ERROR',
            'The request could not be completed. Try again.',
            500,
          );
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
          ...(error.status === 429 ? { 'Retry-After': '60' } : {}),
        },
      },
    );
  }
}

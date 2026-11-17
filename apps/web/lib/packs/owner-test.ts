import { AppError } from '@tikquick/shared';
import { user } from '../server';

export const ownerTestProduct = 'owner-quality-test';
export const ownerTestEmail = 'isbathahmed@gmail.com';
export function isPackTestOwner(identity: {
  id: string;
  email?: string;
  email_confirmed_at?: string;
}) {
  return (
    identity.id === '2f0d6b29-6a12-4181-8ae2-488758dc0823' &&
    identity.email?.toLowerCase() === ownerTestEmail &&
    Boolean(identity.email_confirmed_at)
  );
}
export async function requirePackTestOwner(request: Request) {
  const identity = await user(request);
  if (!isPackTestOwner(identity))
    throw new AppError('NOT_FOUND', 'This purchase is unavailable.', 404);
  return identity;
}

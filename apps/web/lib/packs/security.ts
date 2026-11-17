import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const orderIdSchema = z.uuid();
export const paypalIdSchema = z.string().regex(/^[A-Z0-9]{6,32}$/);

export function orderToken(
  secret: string,
  purpose: 'capture' | 'download',
  id: string,
) {
  return createHmac('sha256', secret)
    .update(`packs:${purpose}:${id}`)
    .digest('base64url');
}

export function validOrderToken(
  secret: string,
  purpose: 'capture' | 'download',
  id: string,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return timingSafeEqual(
    Buffer.from(token),
    Buffer.from(orderToken(secret, purpose, id)),
  );
}

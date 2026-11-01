import { z } from 'zod';
import { endpoint } from '../../../lib/server';
import {
  keySchema,
  accountSchema,
  tiktokAccounts,
  creatorInfo,
} from '../../../lib/zernio';
export const runtime = 'nodejs';
export const POST = endpoint(async (request) => {
  const data = z
    .object({ apiKey: keySchema, accountId: accountSchema.optional() })
    .parse(await request.json());
  return data.accountId
    ? creatorInfo(data.apiKey, data.accountId)
    : { accounts: await tiktokAccounts(data.apiKey) };
});

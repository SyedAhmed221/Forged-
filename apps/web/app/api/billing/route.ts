import { endpoint } from '../../../lib/server';
import { entitlement } from '../../../lib/billing';
export const GET = endpoint((_request, userId) => entitlement(userId));

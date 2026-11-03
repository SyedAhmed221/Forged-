import { endpoint } from '../../../../lib/server';
import { checkout } from '../../../../lib/billing';
export const runtime = 'nodejs';
export const POST = endpoint(checkout);

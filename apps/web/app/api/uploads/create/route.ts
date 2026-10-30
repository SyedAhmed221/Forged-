import { endpoint } from '../../../../lib/server';
import { createUpload } from '../../../../lib/jobs';
export const runtime = 'nodejs';
export const POST = endpoint(createUpload);

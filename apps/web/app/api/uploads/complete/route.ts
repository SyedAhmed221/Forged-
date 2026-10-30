import { endpoint } from '../../../../lib/server';
import { completeUpload } from '../../../../lib/jobs';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = endpoint(completeUpload);

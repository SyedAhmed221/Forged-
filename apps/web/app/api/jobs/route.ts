import { endpoint } from '../../../lib/server';
import { listJobs } from '../../../lib/jobs';
export const runtime = 'nodejs';
export const GET = endpoint(listJobs);

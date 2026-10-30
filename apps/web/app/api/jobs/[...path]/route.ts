import { endpoint } from '../../../../lib/server';
import { jobAction } from '../../../../lib/jobs';
export const runtime = 'nodejs';
const handler = endpoint(async (request, userId) => {
  const [, parts] = new URL(request.url).pathname.split('/api/jobs/');
  const [id, action = '', ...rest] = (parts || '').split('/');
  if (rest.length) throw new Error('Invalid path');
  return jobAction(id, action, request.method, userId);
});
export const GET = handler;
export const POST = handler;
export const DELETE = handler;

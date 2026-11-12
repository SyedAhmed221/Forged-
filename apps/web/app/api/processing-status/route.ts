import { endpoint } from '../../../lib/server';
export const runtime = 'nodejs';
export const GET = endpoint(async () => {
  const base = process.env.TIKQUICK_PS_URL || 'https://byte.tikqcapi.site';
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    ![
      'byte.tikqcapi.site',
      'ps.tikquick.online',
      'tqps.exliatycl.online',
    ].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    return { online: false };
  const start = performance.now();
  try {
    const response = await fetch(new URL('/api/psver', url), {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { online: false };
    const raw = await response.text();
    if (raw.length > 4096) return { online: false };
    const data = JSON.parse(raw);
    return {
      online: data.online === true,
      latency_ms: Math.round(performance.now() - start),
      location:
        typeof data.server_location === 'string'
          ? data.server_location.slice(0, 80)
          : null,
      version:
        typeof data.ps_version === 'string' ||
        typeof data.ps_version === 'number'
          ? String(data.ps_version).slice(0, 30)
          : null,
    };
  } catch {
    return { online: false };
  }
});

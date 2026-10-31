import type { PoolConfig } from 'pg';

// Inline public CA bundles work in serverless deployments without local file paths.
export function databaseOptions(
  connectionString: string,
  ca?: string,
): PoolConfig {
  if (!ca?.trim()) return { connectionString };
  const url = new URL(connectionString);
  // pg's URL SSL parameters otherwise overwrite the explicit verified TLS options.
  for (const key of [
    'sslmode',
    'sslrootcert',
    'sslcert',
    'sslkey',
    'uselibpqcompat',
  ])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true },
  };
}

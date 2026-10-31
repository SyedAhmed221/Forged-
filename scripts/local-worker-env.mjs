// Executed before the worker entrypoint. Values remain in process memory.
if (
  !process.env.WORKER_DATABASE_URL?.trim() &&
  process.env.SUPABASE_POOLER_HOST?.trim() &&
  process.env.WORKER_DATABASE_PASSWORD?.trim()
) {
  const host = process.env.SUPABASE_POOLER_HOST.trim();
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host))
    throw new Error(
      'SUPABASE_POOLER_HOST must be the hostname copied from Supabase Connect.',
    );
  const ref = process.env.SUPABASE_PROJECT_REF || '';
  if (!/^[a-z]{20}$/.test(ref))
    throw new Error('Invalid Supabase project reference.');
  process.env.WORKER_DATABASE_URL = `postgresql://forged_worker.${ref}:${encodeURIComponent(process.env.WORKER_DATABASE_PASSWORD)}@${host}:5432/postgres?sslmode=verify-full`;
}
if (process.env.WORKER_DATABASE_URL && process.env.SUPABASE_CA_CERT_PATH) {
  let connection;
  try {
    connection = new URL(process.env.WORKER_DATABASE_URL);
  } catch {
    throw new Error('Invalid worker database connection format.');
  }
  connection.searchParams.set('sslmode', 'verify-full');
  connection.searchParams.set('sslrootcert', process.env.SUPABASE_CA_CERT_PATH);
  process.env.WORKER_DATABASE_URL = connection.toString();
}

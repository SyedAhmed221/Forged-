import { expect, it } from 'vitest';
import { databaseOptions } from '../packages/shared/src/database';

it('prevents URL SSL parameters from overriding the supplied CA and verification', () => {
  const result = databaseOptions(
    'postgresql://web:password@pooler.example:6543/postgres?sslmode=no-verify&sslrootcert=local.crt&sslcert=client.crt&sslkey=key.pem&uselibpqcompat=true&application_name=forged',
    'certificate\\ncontents',
  );
  const url = new URL(result.connectionString!);
  expect([...url.searchParams.keys()]).toEqual(['application_name']);
  expect(url.port).toBe('6543');
  expect(result.ssl).toEqual({
    ca: 'certificate\ncontents',
    rejectUnauthorized: true,
  });
});

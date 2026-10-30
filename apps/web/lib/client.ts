'use client';
import { createClient } from '@supabase/supabase-js';
let client: ReturnType<typeof createClient> | null = null;
export function authClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return null;
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ));
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = authClient();
  if (!auth)
    throw new Error('The studio is awaiting its service configuration.');
  const { data } = await auth.auth.getSession();
  if (!data.session) throw new Error('Please sign in to continue.');
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error?.message || 'Something went wrong. Please try again.',
    );
  return body;
}

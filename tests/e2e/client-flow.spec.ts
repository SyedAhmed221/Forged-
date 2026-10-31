import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { inspectMedia } from '../../services/worker/src/media';

// Opt in with a dedicated confirmed account and an owned sample. Never save auth traces.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test('client can sign in, upload, process, download and delete a video', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.LIVE_CLIENT_TEST !== 'true',
    'Live service test requires explicit opt-in.',
  );
  test.skip(
    testInfo.project.name !== 'desktop',
    'Submit only one real provider job.',
  );
  test.setTimeout(5 * 60 * 1000);
  const { E2E_EMAIL, E2E_PASSWORD, E2E_SAMPLE_PATH } = process.env;
  expect(
    E2E_EMAIL,
    'Set a dedicated confirmed test account email',
  ).toBeTruthy();
  expect(E2E_PASSWORD, 'Set the test account password privately').toBeTruthy();
  expect(
    E2E_SAMPLE_PATH,
    'Set a playable owned MP4/MOV sample path',
  ).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('Email address').fill(E2E_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/optimize$/);
  await page.locator('#video-file').setInputFiles(resolve(E2E_SAMPLE_PATH!));
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/uploads/create') &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Upload video', exact: true }).click();
  const creation = await created;
  expect(creation.status(), 'The deployed upload API must be configured').toBe(
    200,
  );
  const { id } = (await creation.json()) as { id: string };
  await expect(
    page.getByRole('button', { name: 'Start optimization' }),
  ).toBeVisible({ timeout: 60000 });
  // Poll authenticated UI requests through the browser; no tokens or signed URLs are logged.
  const outcomePending = page.waitForResponse(
    async (r) => {
      if (!r.url().endsWith(`/api/jobs/${id}`) || !r.ok()) return false;
      const job = (await r.json()) as { status: string };
      return ['completed', 'failed', 'cancelled'].includes(job.status);
    },
    { timeout: 180000 },
  );
  await page.getByRole('button', { name: 'Start optimization' }).click();
  await page.reload();
  const outcome = await outcomePending;
  const result = (await outcome.json()) as {
    status: string;
    error_code?: string;
  };
  expect(
    result.status,
    `Processing result: ${result.error_code || result.status}`,
  ).toBe('completed');
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download video', exact: true })
    .click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  const output = testInfo.outputPath('client-result.mp4');
  await download.saveAs(output);
  await inspectMedia(output, AbortSignal.timeout(60000), true);

  await page.goto('/history');
  const row = page
    .locator('tr')
    .filter({ has: page.locator(`a[href="/optimize?job=${id}"]`) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Delete / }).click();
  await row.getByRole('button', { name: 'Delete video?' }).click();
  await expect(row).toHaveCount(0, { timeout: 90000 });
});

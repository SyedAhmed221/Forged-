import { test, expect } from '@playwright/test';
test('landing links to the upload studio with optional encoding off', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /You made it/ }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Optimize a video', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Optimize your video.' }),
  ).toBeVisible();
  await expect(page.getByRole('switch')).not.toBeChecked();
  await page.getByRole('switch').check();
  await expect(page.getByRole('switch')).toBeChecked();
  await expect(
    page.getByRole('link', { name: 'Sign in to upload' }),
  ).toBeVisible();
});
test('validates file types and shows original selection without upload', async ({
  page,
}) => {
  await page.goto('/optimize');
  await page.locator('#video-file').setInputFiles({
    name: 'bad.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('bad'),
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Choose an MP4 or MOV' }),
  ).toBeVisible();
  await page.locator('#video-file').setInputFiles({
    name: 'export.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('sample'),
  });
  await expect(page.getByText(/export\.mp4/)).toBeVisible();
  await expect(page.getByLabel('Original video preview')).toBeVisible();
  await page.getByRole('button', { name: 'Remove selected video' }).click();
  await expect(page.getByText('Drop your next big thing.')).toBeVisible();
});
test('account forms and privacy controls remain usable on small screens', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Create account', exact: true }),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Privacy & storage' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete all videos', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirm deletion of all videos' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep my videos' }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
test('unauthenticated APIs never expose videos or download links', async ({
  request,
}) => {
  for (const path of [
    '/api/jobs',
    '/api/usage',
    '/api/jobs/12345678-1234-1234-1234-123456789abc/download',
  ]) {
    const response = await request.get(path);
    expect([401, 503]).toContain(response.status());
    expect(await response.json()).toHaveProperty('error.code');
  }
});

import { test, expect } from '@playwright/test';

test('homepage shows autoplaying video quality comparison with draggable slider', async ({
  page,
}) => {
  await page.goto('/');
  const slider = page.getByRole('slider', {
    name: 'Compare compressed and high quality video',
  });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('50');

  await slider.fill('25');
  await expect(slider).toHaveValue('25');
  await expect(slider).toHaveAttribute(
    'aria-valuetext',
    '25% compressed preview',
  );

  await expect(
    page.getByText('Drag to compare', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/simulated compression/i)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^(Play|Pause) video$/ }),
  ).toHaveCount(0);

  const video = page.locator('video[src="/branding/quality-comparison.mp4"]');
  await expect(video).toHaveAttribute('autoplay', '');
  await expect(video).toHaveAttribute('loop', '');
  await expect(video).toHaveAttribute('playsinline', '');

  const mediaResponse = await page.request.get(
    '/branding/quality-comparison.mp4',
  );
  expect(mediaResponse.status()).toBe(200);
});

test('homepage hero comparison fits a 320px viewport without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const slider = page.getByRole('slider', {
    name: 'Compare compressed and high quality video',
  });
  await expect(slider).toBeVisible();
  const box = (await slider.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

import { test, expect } from '@playwright/test';

test('subscription fits a 320px viewport without clipping its heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/subscription');
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    headingRight: document.querySelector('h1')!.getBoundingClientRect().right,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(320);
  expect(dimensions.headingRight).toBeLessThanOrEqual(320);
});

test('mobile navigation and account actions have 44px touch targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  for (const link of await page
    .getByRole('navigation', { name: 'Homepage navigation' })
    .getByRole('link')
    .all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.goto('/login');
  for (const name of ['Open menu', 'Forgot password?', 'Create an account']) {
    expect(
      (await page.getByRole('button', { name, exact: true }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
  }
});

test('mobile drawer dismisses outside and with Escape, locks scroll, and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/optimize');
  const sidebar = page.locator('#workspace-navigation');
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  await expect(sidebar).not.toBeVisible();
  await trigger.click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('link').first()).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    'hidden',
  );
  await page
    .getByRole('button', { name: 'Close navigation menu', exact: true })
    .click({ position: { x: 375, y: 200 } });
  await expect(sidebar).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    'hidden',
  );
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(sidebar).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('keyboard focus stays inside the open mobile navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/optimize');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const last = page
    .locator('#workspace-navigation > .sidebar-bottom')
    .getByRole('link')
    .last();
  await last.focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Close menu', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
});

test('connection check does not label a signed-out user as a provider outage', async ({
  page,
}) => {
  await page.goto('/optimize');
  await page
    .getByRole('button', { name: 'Test connection', exact: true })
    .click();
  await expect(page.locator('.server-check-error')).toContainText(
    /sign in|configuration/i,
  );
  await expect(page.locator('.server-offline')).toHaveCount(0);
});

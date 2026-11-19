import { test, expect } from '@playwright/test';

test('FAQ is linked from the homepage and answers expand on click', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Homepage navigation' })
    .getByRole('link', { name: 'FAQ' })
    .click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frequently asked questions' }),
  ).toBeVisible();
  const item = page.locator('details.faq-item').filter({
    hasText: 'TikTok still compressed my video. Why?',
  });
  const answerLink = item.getByRole('link', { name: 'Analytics' });
  await expect(answerLink).toBeHidden();
  await item.locator('summary').click();
  await expect(answerLink).toBeVisible();
  await expect(answerLink).toHaveAttribute('href', '/analytics');
  await item.locator('summary').click();
  await expect(answerLink).toBeHidden();
});

test('FAQ answers toggle from the keyboard', async ({ page }) => {
  await page.goto('/faq');
  const summary = page.locator('summary.faq-question').first();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details.faq-item').first()).toHaveAttribute(
    'open',
    '',
  );
});

test('FAQ publishes FAQPage structured data', async ({ page }) => {
  await page.goto('/faq');
  const data = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent())!,
  );
  expect(data['@type']).toBe('FAQPage');
  expect(data.mainEntity.length).toBe(
    await page.locator('details.faq-item').count(),
  );
  expect(JSON.stringify(data)).not.toContain('](');
});

test('FAQ fits a 320px viewport with 44px question targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/faq');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('summary.faq-question').first().click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  for (const summary of await page.locator('summary.faq-question').all()) {
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('homepage navigation items are boxed and fit a 320px viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const links = await page
    .getByRole('navigation', { name: 'Homepage navigation' })
    .getByRole('link')
    .all();
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const style = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, radius: s.borderTopLeftRadius };
    });
    expect(style.border).toBe('1px');
    expect(parseFloat(style.radius)).toBeGreaterThan(0);
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

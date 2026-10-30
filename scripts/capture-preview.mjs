import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  for (const route of ['', 'optimize']) {
    await page.goto(`http://127.0.0.1:3000/${route}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.screenshot({
      path: `artifacts/${route || 'landing'}-desktop.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3000/optimize');
  await page.screenshot({
    path: 'artifacts/optimize-mobile.png',
    fullPage: true,
  });
} finally {
  await browser.close();
}

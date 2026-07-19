import { expect, test } from '@playwright/test';
import { dismissOrientation } from './helpers.js';

const VIEWPORTS = [
  { name: '720p', width: 1280, height: 720 },
  { name: '1080p', width: 1920, height: 1080 },
  { name: '1440p', width: 2560, height: 1440 },
  { name: 'phone', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`desk composition has no horizontal overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/?reset=1');
    await dismissOrientation(page);

    await expect(page.locator('#office-scene')).toBeVisible();
    await expect(page.locator('.scene-stage')).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });
}

test('reduced motion loads desk without throwing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?reset=1');
  await dismissOrientation(page);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');
  await expect(page.locator('#crt-monitor')).toBeVisible();
});

import { expect, test } from '@playwright/test';

/**
 * Visual regression smoke @ 1920×1080 — desk ambient + terminal frame.
 * Soft assertion: screenshots attach for review; size sanity checked.
 */
test.describe('visual regression smoke', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('desk feed screenshot @ 1920x1080', async ({ page }) => {
    await page.goto('/?reset=1');
    await page.locator('#btn-close-orientation').click();
    await expect(page.locator('#office-scene')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');
    const shot = await page.screenshot({ fullPage: false });
    expect(shot.byteLength).toBeGreaterThan(10_000);
    await test.info().attach('desk-1920', { body: shot, contentType: 'image/png' });
  });

  test('terminal frame screenshot @ 1920x1080', async ({ page }) => {
    await page.goto('/?reset=1');
    await page.locator('#btn-close-orientation').click();
    await page.locator('#crt-monitor').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-view', 'terminal', { timeout: 10_000 });
    await expect(page.locator('#protocol-bins .protocol-bin')).toHaveCount(5);
    await expect(page.locator('#stage-matrix')).toHaveClass(/active/);
    const shot = await page.screenshot({ fullPage: false });
    expect(shot.byteLength).toBeGreaterThan(10_000);
    await test.info().attach('terminal-1920', { body: shot, contentType: 'image/png' });
  });
});

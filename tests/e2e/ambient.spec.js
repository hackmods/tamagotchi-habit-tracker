import { expect, test } from '@playwright/test';
import { STATE_KEY, buildState, dismissOrientation } from './helpers.js';

test.describe('ambient rare events', () => {
  test('ambientDebug fires a visible desk event', async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(buildState()) });

    await page.goto('/?ambientDebug=A');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const toast = document.getElementById('ambient-toast');
          const toastVisible = toast && !toast.classList.contains('hidden');
          const ambientClass = [...document.body.classList].some((c) => c.startsWith('ambient-'));
          return toastVisible || ambientClass;
        });
      }, { timeout: 5000 })
      .toBe(true);
  });

  test('tier C compliance drill persists freeze timestamp', async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(buildState()) });

    await page.goto('/?ambientDebug=C');
    await dismissOrientation(page);

    await expect
      .poll(async () => {
        return page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return false;
          const s = JSON.parse(raw);
          return Boolean(s.ambient?.lastEventAt) || Boolean(s.incentives?.complianceFreezeUntil) || Boolean(s.ambient?.sustenancePauseUntil) || (s.subject?.cumulativeQuota > 0);
        }, STATE_KEY);
      }, { timeout: 5000 })
      .toBe(true);
  });
});

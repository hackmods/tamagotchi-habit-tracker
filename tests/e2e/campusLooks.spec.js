import { expect, test } from '@playwright/test';
import { STATE_KEY, buildState, dismissOrientation, openTerminal } from './helpers.js';

test.describe('campus gameplay looks', () => {
  test('body receives look temper and pressure data attrs', async ({ page }) => {
    await page.goto('/?reset=1&debugTime=12:00');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-look-temper', /.+/);
    await expect(page.locator('body')).toHaveAttribute('data-look-pressure', /nominal|thin|breach/);
    await expect(page.locator('body')).toHaveAttribute('data-standing-mdr', 'neutral');
  });

  test('breach pressure from noncompliant metrics', async ({ page }) => {
    const seeded = buildState({
      metrics: {
        fluidEfficiency: 20,
        quotaProgression: 20,
        complianceStanding: 10,
        sustenanceLevel: 20,
      },
      dailyLog: {
        ...buildState().dailyLog,
        compliancePenaltyApplied: true,
      },
    });
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(seeded) });
    await page.goto('/');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-look-pressure', 'breach');
  });

  test('warm O&D standing and quest beacon on wellness peek', async ({ page }) => {
    const seeded = buildState({
      departments: { mdr: 0, od: 25, wellness: 0, breakroom: 0 },
      sidequests: {
        active: { id: 'wellness-invitation', step: 'gaze', startedAt: new Date().toISOString() },
        completed: [],
        cooldowns: {},
      },
    });
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(seeded) });
    await page.goto('/');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-standing-od', 'warm');
    await expect(page.locator('body')).toHaveAttribute('data-quest-beacon', 'wellness-peek');
    await expect(page.locator('#nav-wellness-door')).toHaveClass(/quest-beacon/);
  });

  test('UTILITIES still shows standing after looks apply', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);
    await page.locator('#btn-center-utilities').click();
    await expect(page.locator('#dept-standing-line')).toBeVisible();
  });
});

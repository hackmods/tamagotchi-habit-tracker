import { expect, test } from '@playwright/test';
import { dismissOrientation, openTerminal } from './helpers.js';

test.describe('floor campus', () => {
  test('deep link opens hallway and gates terminal', async ({ page }) => {
    await page.goto('/?reset=1&room=hallway');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-room', 'hallway');
    await expect(page.locator('#room-hallway')).toBeVisible();
    await expect(page.locator('#cam-feed-id')).toContainText('HALLWAY');
    await expect(page.locator('#btn-return-mdr')).toBeVisible();

    await page.locator('#crt-monitor').click({ force: true }).catch(() => {});
    await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');
  });

  test('corridor peek and return to MDR', async ({ page }) => {
    await page.goto('/?reset=1');
    await dismissOrientation(page);
    await expect(page.locator('body')).toHaveAttribute('data-room', 'mdr');
    await page.locator('#nav-corridor').click();
    await expect(page.locator('body')).toHaveAttribute('data-room', 'hallway');
    await page.locator('#btn-return-mdr').click();
    await expect(page.locator('body')).toHaveAttribute('data-room', 'mdr');
    await expect(page.locator('#room-mdr')).toBeVisible();
  });

  test('wellness door and Escape return', async ({ page }) => {
    await page.goto('/?reset=1');
    await dismissOrientation(page);
    await page.locator('#nav-wellness-door').click();
    await expect(page.locator('body')).toHaveAttribute('data-room', 'wellness');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-room', 'mdr');
  });

  test('UTILITIES shows department standing', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);
    await page.locator('#btn-center-utilities').click();
    await expect(page.locator('#dept-standing-line')).toBeVisible();
    await expect(page.locator('#quest-hud-line')).toContainText('INVITATION');
    await expect(page.locator('#campus-room-line')).toContainText('MDR');
  });

  test('hallway doors reach breakroom and od', async ({ page }) => {
    await page.goto('/?reset=1&room=hallway');
    await dismissOrientation(page);
    await page.locator('.room-door[data-goto="breakroom"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-room', 'breakroom');
    await page.locator('#btn-return-mdr').click();
    await page.locator('#nav-corridor').click();
    await page.locator('.room-door[data-goto="od"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-room', 'od');
  });
});

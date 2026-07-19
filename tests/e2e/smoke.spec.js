import { expect, test } from '@playwright/test';
import { STATE_KEY, buildState, dismissOrientation, openTerminal, openTerminalByPointer } from './helpers.js';

test.describe('SVG avatar smoke', () => {
  test('office scene loads with wellness SVG and Innie-Cam HUD', async ({ page }) => {
    await page.goto('/?reset=1');
    await dismissOrientation(page);
    await expect(page.locator('.wellness-svg')).toBeVisible();
    await expect(page.locator('.wellness-svg rect')).not.toHaveCount(0);
    await expect(page.locator('.cam-feed-id')).toContainText('INNIE-CAM');
    await expect(page.locator('.cam-rec')).toContainText('REC');
    await expect(page.locator('#cam-clock')).toBeVisible();
  });

  test('data matrix renders refinement avatar SVG with ghost stage defaults', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);

    const avatar = page.locator('#mdr-avatar');
    await expect(avatar).toBeAttached();
    await expect(avatar.locator('svg.mdr-avatar-svg')).toBeAttached();
    await expect(avatar).toHaveAttribute('data-stage', 'ghost');
    await expect(page.locator('#mdr-data-node')).toHaveAttribute('data-avatar-stage', 'ghost');
    await expect(page.locator('#avatar-visibility-label')).toContainText('VISIBILITY: 8%');
    await expect(page.locator('.av-file-badge')).toHaveText('F-0001');
  });

  test('avatar visibility and unlock layers respond to saved progress', async ({ page }) => {
    const seeded = buildState({
      fileState: {
        fileNumber: 3,
        quota: 500,
        milestonesHit: ['eraser', 'finger-trap'],
      },
      incentives: {
        inventory: ['coffee-cozy'],
        activeSkin: null,
        complianceFreezeUntil: null,
        fingerTrapTaps: 0,
      },
    });

    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(seeded) });

    await page.goto('/');
    await openTerminal(page);

    const avatar = page.locator('#mdr-avatar');
    await expect(avatar).toHaveAttribute('data-stage', 'fenced');
    await expect(avatar).toHaveAttribute('data-file-variant', '2');
    await expect(avatar).toHaveAttribute('data-unlock', 'eraser trap cozy');
    await expect(page.locator('#avatar-visibility-label')).toContainText('VISIBILITY: 54%');
    await expect(page.locator('#mdr-data-node')).toHaveAttribute('data-avatar-stage', 'fenced');
  });

  test('refinement burst applies transient animation class to data node', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);

    await page.getByRole('tab', { name: /RESOURCING/i }).click();
    await page.locator('#btn-rehydrate-250').click();
    await expect(page.locator('#mdr-data-node')).toHaveClass(/refining/);
    await expect(page.locator('#mdr-data-node')).not.toHaveClass(/refining/, { timeout: 2000 });
  });
});

test.describe('core terminal smoke', () => {
  test('tab navigation and ESC return to desk view', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);

    await page.getByRole('tab', { name: /RESOURCING/i }).click();
    await expect(page.locator('#tab-resourcing')).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');
    await expect(page.locator('#crt-monitor')).not.toHaveClass(/focused/);
  });

  test('RESOURCING shows daily protocol checklist with status', async ({ page }) => {
    await page.goto('/?reset=1&debugTime=11:00');
    await openTerminal(page);
    await page.getByRole('tab', { name: /RESOURCING/i }).click();
    await expect(page.locator('#protocol-checklist')).toBeVisible();
    await expect(page.locator('#protocol-checklist li')).toHaveCount(5);
    await expect(page.locator('#protocol-checklist-summary')).toContainText(/PLEASE COMPLY/);
    await expect(page.locator('#protocol-checklist li[data-status="overdue"]')).toHaveCount(1);
    await expect(page.locator('#btn-log-activity')).toBeVisible();
    await expect(page.locator('#btn-administer-morning')).toBeVisible();
  });

  test('CRT opens via real pointer click', async ({ page }) => {
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
    }, { key: STATE_KEY, value: JSON.stringify(buildState()) });
    await page.goto('/');
    await openTerminalByPointer(page);
    await expect(page.getByRole('application', { name: /Macrodata Refinement/i })).toBeVisible();
  });
});

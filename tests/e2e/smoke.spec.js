import { expect, test } from '@playwright/test';

const STATE_KEY = 'lumon-compliance-state';

function buildState(overrides = {}) {
  return {
    subject: {
      subjectNumber: 4229,
      cumulativeQuota: 0,
      allocationCredits: 0,
      refinementTier: 0,
      prestigeMultiplier: 1,
      filesCompleted: 0,
    },
    fileState: {
      fileNumber: 1,
      quota: 0,
      milestonesHit: [],
    },
    metrics: {
      fluidEfficiency: 100,
      quotaProgression: 100,
      complianceStanding: 100,
      sustenanceLevel: 100,
    },
    dailyLog: {
      date: '2026-07-12',
      fluidIntakeMl: 0,
      activityUnits: 0,
      sustenanceUnits: 0,
      morningDoseAt: null,
      morningPenaltyApplied: false,
      complianceDoseAt: null,
      compliancePenaltyApplied: false,
      sustenanceWarned: false,
      quotasAwarded: 0,
    },
    incentives: { inventory: [], activeSkin: null, complianceFreezeUntil: null, fingerTrapTaps: 0 },
    onboardingComplete: true,
    lastSavedAt: new Date().toISOString(),
    unlockedPalettes: ['lumon-default'],
    unlockedGeometries: ['hex-core'],
    activePalette: 'lumon-default',
    activeGeometry: 'hex-core',
    sync: { enabled: false, code: null, apiBase: '', contentHash: null, lastPushedAt: null, lastPulledAt: null },
    ...overrides,
  };
}

async function dismissOrientation(page) {
  const modal = page.locator('#orientation-modal');
  if (await modal.isVisible()) {
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toHaveClass(/hidden/);
  }
}

async function openTerminal(page) {
  await dismissOrientation(page);
  await page.getByRole('button', { name: 'Open Refinement Terminal' }).click();
  await expect(page.getByRole('dialog', { name: 'Refinement Terminal' })).toBeVisible();
}

test.describe('SVG avatar smoke', () => {
  test('office scene loads with animated employee SVG', async ({ page }) => {
    await page.goto('/?reset=1');
    await expect(page.locator('.employee-svg')).toBeVisible();
    await expect(page.locator('.employee-svg rect')).not.toHaveCount(0);
  });

  test('data matrix renders refinement avatar SVG with ghost stage defaults', async ({ page }) => {
    await page.goto('/?reset=1');
    await openTerminal(page);

    const avatar = page.locator('#mdr-avatar');
    await expect(avatar).toBeVisible();
    await expect(avatar.locator('svg.mdr-avatar-svg')).toBeVisible();
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
    await expect(page.locator('#terminal-overlay')).not.toHaveClass(/active/);
    await expect(page.locator('body')).toHaveAttribute('data-view', 'desk');
  });
});

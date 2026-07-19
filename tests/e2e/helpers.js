import { expect, test } from '@playwright/test';

const STATE_KEY = 'lumon-compliance-state';

export function buildState(overrides = {}) {
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
    ambient: {
      lastEventAt: null,
      lastEventId: null,
      sessionCount: 0,
      dailyDate: null,
      dailyTiers: { A: 0, B: 0, C: 0 },
      bCreditsToday: 0,
      sustenancePauseUntil: null,
    },
    kioskAwake: false,
    kioskFullscreen: false,
    ambientHintSeen: true,
    ...overrides,
  };
}

export async function dismissOrientation(page) {
  const modal = page.locator('#orientation-modal');
  if (await modal.isVisible()) {
    await page.locator('#btn-close-orientation').click();
    await expect(modal).toHaveClass(/hidden/);
  }
}

export async function openTerminal(page) {
  await dismissOrientation(page);
  await page.locator('#crt-monitor .crt-hit').click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'terminal');
  await expect(page.getByRole('application', { name: /Macrodata Refinement/i })).toBeVisible();
  await expect(page.locator('#crt-monitor')).toHaveClass(/focused/);
}

/** Explicit mouse-path open (P4 hardening). */
export async function openTerminalByPointer(page) {
  await dismissOrientation(page);
  const hit = page.locator('#crt-monitor .crt-hit');
  await hit.scrollIntoViewIfNeeded();
  const box = await hit.boundingBox();
  if (!box) throw new Error('CRT hit plate has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'terminal');
}

export { STATE_KEY };

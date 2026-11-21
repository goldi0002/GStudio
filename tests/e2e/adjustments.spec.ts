import { test, expect } from '@playwright/test';
import { canvasStats, collectPageErrors, evidence, openSample } from './helpers';

test.describe('Adjustments', () => {
  test('Crisp Mono preset desaturates the composite', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Color & Alpha Calibration');

    const before = await canvasStats(page);
    expect(before.colorful).toBeGreaterThan(50);

    await page.getByRole('button', { name: 'Crisp Mono' }).click();
    await page.waitForTimeout(700);

    const after = await canvasStats(page);
    expect(after.colorful).toBeLessThan(before.colorful * 0.5);

    await evidence(page, testInfo, 'crisp-mono');
    expect(errors).toEqual([]);
  });

  test('Auto Balance Tone runs locally without losing the image', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    const before = await canvasStats(page);
    await page.getByRole('button', { name: 'Auto Balance Tone (Local)' }).click();
    await page.waitForTimeout(600);

    const after = await canvasStats(page);
    expect(after.samples).toBe(before.samples);
    expect(after.colorful).toBeGreaterThan(10);

    await evidence(page, testInfo, 'auto-balance');
    expect(errors).toEqual([]);
  });
});

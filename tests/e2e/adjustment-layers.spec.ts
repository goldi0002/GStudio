import { test, expect } from '@playwright/test';
import { blurActive, canvasStats, collectPageErrors, evidence, openSample } from './helpers';

test.describe('Adjustment layers', () => {
  test('an adjustment layer edits non-destructively and supports undo and layer targeting', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Color & Alpha Calibration');
    const before = await canvasStats(page);
    expect(before.colorful).toBeGreaterThan(50);

    await page.getByRole('button', { name: 'Add Adjustment Layer' }).click();
    await expect(page.getByText('Adjustment 1', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('adjustment-target')).toContainText('adjustment layer');

    // A fresh adjustment layer is an identity.
    const identity = await canvasStats(page);
    expect(identity.colorful).toBeGreaterThan(before.colorful * 0.9);

    await page.getByRole('button', { name: 'Crisp Mono' }).click();
    await page.waitForTimeout(700);
    const mono = await canvasStats(page);
    expect(mono.colorful).toBeLessThan(before.colorful * 0.5);
    await evidence(page, testInfo, 'adjustment-layer-mono');

    // Undo removes the layer's adjustment but keeps the layer.
    await blurActive(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(700);
    const undone = await canvasStats(page);
    expect(undone.colorful).toBeGreaterThan(before.colorful * 0.9);
    await expect(page.getByText('Adjustment 1', { exact: true }).first()).toBeVisible();

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(700);
    const redone = await canvasStats(page);
    expect(redone.colorful).toBeLessThan(before.colorful * 0.5);

    expect(errors).toEqual([]);
  });

  test('selecting another layer targets the whole-document adjustments again', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Color & Alpha Calibration');
    await page.getByRole('button', { name: 'Add Adjustment Layer' }).click();
    await expect(page.getByTestId('adjustment-target')).toContainText('adjustment layer');

    await expect(page.getByTitle('Merge Down')).toBeDisabled();

    await page.locator('[data-layer-row]:not([data-layer-row="Adjustment 1"])').first().click();
    await expect(page.getByTestId('adjustment-target')).toContainText('whole document');
    expect(errors).toEqual([]);
  });
});

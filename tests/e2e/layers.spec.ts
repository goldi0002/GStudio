import { test, expect } from '@playwright/test';
import {
  blurActive,
  collectPageErrors,
  createBlankProject,
  evidence,
  layerCount,
  zoomActualPixels,
} from './helpers';

test.describe('Layer stack', () => {
  test('new raster layers are numbered from 1 per document', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('Control+Shift+n');
    await blurActive(page);
    await page.keyboard.press('Control+Shift+n');

    expect(await layerCount(page)).toBe(3);
    await expect(page.getByText('Layer 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Layer 2', { exact: true })).toBeVisible();

    await evidence(page, testInfo, 'raster-layers');
    expect(errors).toEqual([]);
  });

  test('duplicating a layer keeps the original and appends a Copy', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('Control+Shift+n');
    await expect.poll(() => layerCount(page)).toBe(2);

    await blurActive(page);
    await page.keyboard.press('Control+j');
    await expect.poll(() => layerCount(page)).toBe(3);
    await expect(page.getByText('Layer 1 Copy', { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('backspace removes the active layer without a selection', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('Control+Shift+n');
    await expect.poll(() => layerCount(page)).toBe(2);

    await blurActive(page);
    await page.keyboard.press('Backspace');
    await expect.poll(() => layerCount(page)).toBe(1);
    await expect(page.getByText('Layer 1', { exact: true })).toHaveCount(0);

    // Undo restores the deleted layer.
    await blurActive(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => layerCount(page)).toBe(2);

    expect(errors).toEqual([]);
  });
});

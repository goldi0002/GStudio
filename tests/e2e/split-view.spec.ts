import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasCenter,
  collectPageErrors,
  createBlankProject,
  evidence,
  pixelAtOffset,
  setRangeByLabel,
  splitBoundaryOffsetX,
  zoomActualPixels,
} from './helpers';

test.describe('Before / after split view', () => {
  test('split view shows the original on the left and adjustments on the right', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);

    await setRangeByLabel(page, 'Brightness', -100);
    await page.waitForTimeout(900);

    const adjusted = await pixelAtOffset(page, { dx: -150, dy: 0 });
    expect(adjusted.r).toBeLessThan(200);

    await blurActive(page);
    await page.keyboard.press('\\');
    await expect(page.getByText('Before (Original)', { exact: true })).toBeVisible();
    await expect(page.getByText('After (Adjusted)', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);

    const left = await pixelAtOffset(page, { dx: -150, dy: 0 });
    const right = await pixelAtOffset(page, { dx: 150, dy: 0 });
    expect(left.r).toBeGreaterThan(220);
    expect(right.r).toBeLessThan(200);
    expect(left.r - right.r).toBeGreaterThan(40);

    await evidence(page, testInfo, 'split-view');

    // Pressing backslash again turns the comparison off.
    await blurActive(page);
    await page.keyboard.press('\\');
    await expect(page.getByText('Before (Original)', { exact: true })).toHaveCount(0);
    const off = await pixelAtOffset(page, { dx: -150, dy: 0 });
    expect(off.r).toBeLessThan(200);

    expect(errors).toEqual([]);
  });

  test('dragging the divider moves the before/after boundary', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);
    await setRangeByLabel(page, 'Brightness', -100);
    await page.waitForTimeout(900);

    await blurActive(page);
    await page.keyboard.press('\\');
    await page.waitForTimeout(300);

    const boundary = await splitBoundaryOffsetX(page);
    expect(Math.abs(boundary)).toBeLessThan(40);
    expect((await pixelAtOffset(page, { dx: 60, dy: 0 })).r).toBeLessThan(200);

    const center = await canvasCenter(page);
    await page.mouse.move(center.x + boundary, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + boundary + 120, center.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The before half now extends past the sampled point.
    expect((await pixelAtOffset(page, { dx: 60, dy: 0 })).r).toBeGreaterThan(220);
    expect(await splitBoundaryOffsetX(page)).toBeGreaterThan(boundary + 60);

    await evidence(page, testInfo, 'split-divider-dragged');
    expect(errors).toEqual([]);
  });

  test('holding the original button temporarily shows the unadjusted canvas', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);
    await setRangeByLabel(page, 'Brightness', -100);
    await page.waitForTimeout(900);

    expect((await pixelAtOffset(page, { dx: 0, dy: 0 })).r).toBeLessThan(200);

    const hold = page.getByRole('button', { name: 'Hold Original' });
    await hold.dispatchEvent('pointerdown');
    await expect(
      page.getByText('Showing Original (Before Adjustments)', { exact: true })
    ).toBeVisible();
    await page.waitForTimeout(200);
    expect((await pixelAtOffset(page, { dx: 0, dy: 0 })).r).toBeGreaterThan(220);
    await evidence(page, testInfo, 'hold-original');

    await hold.dispatchEvent('pointerup');
    await expect(
      page.getByText('Showing Original (Before Adjustments)', { exact: true })
    ).toHaveCount(0);
    await page.waitForTimeout(200);
    expect((await pixelAtOffset(page, { dx: 0, dy: 0 })).r).toBeLessThan(200);

    expect(errors).toEqual([]);
  });
});

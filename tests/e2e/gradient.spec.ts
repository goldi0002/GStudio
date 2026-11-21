import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasStats,
  collectPageErrors,
  createBlankProject,
  dragOnCanvas,
  evidence,
  pixelAtOffset,
  zoomActualPixels,
} from './helpers';

test.describe('Gradient tool', () => {
  test('linear gradient blends the foreground into the background', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    const before = await canvasStats(page);
    expect(before.colorful).toBeLessThan(20);

    await blurActive(page);
    await page.keyboard.press('k');
    await expect(page.getByText('Gradient', { exact: true })).toBeVisible();

    await dragOnCanvas(page, { dx: -200, dy: 0 }, { dx: 200, dy: 0 }, 20);
    const after = await canvasStats(page);
    expect(after.colorful).toBeGreaterThan(200);

    const start = await pixelAtOffset(page, { dx: -180, dy: 0 });
    const end = await pixelAtOffset(page, { dx: 180, dy: 0 });
    // Foreground is blue (#0A84FF), background is white: the ramp must be visible.
    expect(start.b - start.r).toBeGreaterThan(60);
    expect(end.r - end.b).toBeGreaterThan(-20);
    expect(end.r).toBeGreaterThan(start.r + 60);

    await evidence(page, testInfo, 'linear-gradient');
    expect(errors).toEqual([]);
  });

  test('radial gradient concentrates the foreground at the drag origin', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('k');
    await page.getByRole('button', { name: 'Radial', exact: true }).click();

    await dragOnCanvas(page, { dx: 0, dy: 0 }, { dx: 200, dy: 0 }, 20);
    await page.waitForTimeout(300);

    const center = await pixelAtOffset(page, { dx: 0, dy: 0 });
    const far = await pixelAtOffset(page, { dx: 260, dy: 0 });
    expect(center.b).toBeGreaterThan(180);
    expect(center.r).toBeLessThan(120);
    expect(far.r).toBeGreaterThan(180);
    expect(far.b - far.r).toBeLessThan(40);

    await evidence(page, testInfo, 'radial-gradient');
    expect(errors).toEqual([]);
  });

  test('gradient style can fade the foreground to transparent', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('k');
    await page.getByRole('button', { name: 'FG → Transp' }).click();
    await dragOnCanvas(page, { dx: -200, dy: 0 }, { dx: 200, dy: 0 }, 20);

    const start = await pixelAtOffset(page, { dx: -180, dy: 0 });
    const end = await pixelAtOffset(page, { dx: 180, dy: 0 });
    expect(start.b - start.r).toBeGreaterThan(60);
    // The transparent end shows the checkerboard, so it must not stay blue.
    expect(end.b - end.r).toBeLessThan(40);

    await evidence(page, testInfo, 'transparent-gradient');
    expect(errors).toEqual([]);
  });
});

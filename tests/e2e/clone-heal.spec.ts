import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasCenter,
  canvasStats,
  clickCanvas,
  collectPageErrors,
  createBlankProject,
  dragOnCanvas,
  evidence,
  setForegroundColor,
  zoomActualPixels,
} from './helpers';

test.describe('Clone stamp & spot healing', () => {
  test('clone stamp samples a source and copies its pixels elsewhere', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    // Paint a blue band in the upper half to use as the clone source.
    await blurActive(page);
    await page.keyboard.press('b');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press(']');
    await dragOnCanvas(page, { dx: -150, dy: -120 }, { dx: 150, dy: -120 });
    const painted = await canvasStats(page);
    expect(painted.blue).toBeGreaterThan(100);

    await page.keyboard.press('s');
    await expect(page.getByText('Clone Stamp', { exact: true })).toBeVisible();
    await expect(page.getByText('Alt+Click to sample').first()).toBeVisible();

    // Alt+click inside the painted band to set the sample point.
    const center = await canvasCenter(page);
    await page.keyboard.down('Alt');
    await page.mouse.click(center.x - 100, center.y - 120);
    await page.keyboard.up('Alt');
    await expect(page.getByText(/^Src -?\d+, -?\d+$/)).toBeVisible();
    await expect(page.getByText(/Clone source sampled at/)).toBeVisible();

    // Paint with the clone in the empty lower half: copied pixels add blue.
    await dragOnCanvas(page, { dx: 0, dy: 120 }, { dx: 150, dy: 120 });
    const cloned = await canvasStats(page);
    expect(cloned.blue).toBeGreaterThan(painted.blue + 30);

    await evidence(page, testInfo, 'clone-stamp');
    expect(errors).toEqual([]);
  });

  test('spot healing blends a blemish back into its surroundings', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    // Flood the layer blue, then paint a red blemish on it.
    await blurActive(page);
    await page.keyboard.press('g');
    await clickCanvas(page);
    await setForegroundColor(page, '#FF0000');
    await page.keyboard.press('b');
    await clickCanvas(page);

    const blemished = await canvasStats(page);
    expect(blemished.red).toBeGreaterThan(10);

    await page.keyboard.press('j');
    await expect(page.getByText('Spot Healing', { exact: true })).toBeVisible();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press(']');
    await clickCanvas(page);
    await page.waitForTimeout(300);

    const healed = await canvasStats(page);
    expect(healed.red).toBeLessThan(Math.max(3, blemished.red * 0.5));
    expect(healed.blue).toBeGreaterThan(300);

    await evidence(page, testInfo, 'spot-healed');
    expect(errors).toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasStats,
  clickCanvas,
  collectPageErrors,
  createBlankProject,
  dragOnCanvas,
  evidence,
  openMenu,
  zoomActualPixels,
} from './helpers';

async function fillCanvasBlue(page: import('@playwright/test').Page): Promise<void> {
  await blurActive(page);
  await page.keyboard.press('g');
  await clickCanvas(page);
}

test.describe('Selections & masks', () => {
  test('marquee selection deletes a region of the layer', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    await fillCanvasBlue(page);

    const before = await canvasStats(page);
    expect(before.blue).toBeGreaterThan(500);

    await blurActive(page);
    await page.keyboard.press('m');
    await expect(page.getByText(/^Rectangular Marquee · /)).toBeVisible();
    await dragOnCanvas(page, { dx: -200, dy: -200 }, { dx: 200, dy: 200 });
    await evidence(page, testInfo, 'marquee-selection');

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);

    const after = await canvasStats(page);
    // The marquee covers most of the sampled center, so clearing it should remove most of the blue.
    expect(after.blue).toBeLessThan(before.blue * 0.6);
    expect(after.blue).toBeGreaterThan(0);

    await evidence(page, testInfo, 'marquee-deleted');
    expect(errors).toEqual([]);
  });

  test('select all plus backspace clears the whole layer', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    await fillCanvasBlue(page);

    const filled = await canvasStats(page);
    expect(filled.blue).toBeGreaterThan(500);

    await blurActive(page);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    const cleared = await canvasStats(page);
    expect(cleared.blue).toBeLessThan(20);
    expect(cleared.white).toBeLessThan(filled.white + 50);

    await evidence(page, testInfo, 'select-all-cleared');
    expect(errors).toEqual([]);
  });

  test('inverted selection clears everything outside the marquee', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    await fillCanvasBlue(page);

    const filled = await canvasStats(page);

    await blurActive(page);
    await page.keyboard.press('m');
    await dragOnCanvas(page, { dx: -60, dy: -60 }, { dx: 60, dy: 60 });
    await page.keyboard.press('Control+Shift+i');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    const after = await canvasStats(page);
    expect(after.blue).toBeLessThan(filled.blue / 2);

    await evidence(page, testInfo, 'inverted-selection');
    expect(errors).toEqual([]);
  });

  test('mask from selection hides the area outside the marquee', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    await fillCanvasBlue(page);

    const before = await canvasStats(page);
    expect(before.blue).toBeGreaterThan(500);

    await blurActive(page);
    await page.keyboard.press('m');
    await dragOnCanvas(page, { dx: -90, dy: -90 }, { dx: 90, dy: 90 });

    await openMenu(page, 'Layer');
    await page.getByRole('button', { name: /Mask from Selection/ }).click();
    await page.waitForTimeout(400);

    const masked = await canvasStats(page);
    expect(masked.blue).toBeLessThan(before.blue / 2);

    await evidence(page, testInfo, 'mask-from-selection');
    expect(errors).toEqual([]);
  });

  test('grow and shrink resize a selection by the given pixels', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    await blurActive(page);
    await page.keyboard.press('m');
    await dragOnCanvas(page, { dx: -80, dy: -80 }, { dx: 80, dy: 80 });

    const readout = page.locator('span.whitespace-nowrap').filter({ hasText: /^\d+ × \d+ px/ });
    const width = async () => Number((await readout.innerText()).split('×')[0].trim());
    const start = await width();

    await page.getByLabel('Grow or shrink amount in pixels').fill('5');
    await page.getByRole('button', { name: 'Grow', exact: true }).click();
    await expect.poll(width).toBe(start + 10);

    await page.getByRole('button', { name: 'Shrink', exact: true }).click();
    await expect.poll(width).toBe(start);
    expect(errors).toEqual([]);
  });
});

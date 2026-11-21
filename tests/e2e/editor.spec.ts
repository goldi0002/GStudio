import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasStats,
  collectPageErrors,
  createBlankProject,
  evidence,
  setEffectColor,
  setRangeByLabel,
  toggleEffect,
} from './helpers';

async function addShapeLayer(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Add Shape Layer' }).click();
  await expect(page.getByText(/^Rounded Rect/).first()).toBeVisible();
  await page.waitForTimeout(300);
}

test.describe('Editor interactions', () => {
  test('tool shortcuts switch tools and update the status bar', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await blurActive(page);

    await page.keyboard.press('b');
    await expect(page.getByText(/^Brush · /)).toBeVisible();
    await evidence(page, testInfo, 'brush-tool');

    await page.keyboard.press('e');
    await expect(page.getByText(/^Eraser · /)).toBeVisible();

    await page.keyboard.press('t');
    await expect(page.getByText(/^Text · /)).toBeVisible();

    await page.keyboard.press('v');
    await expect(page.getByText(/^Move & Transform · /)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('adds a shape layer and composites it onto the canvas', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const stats = await canvasStats(page);
    expect(stats.blue).toBeGreaterThan(100);

    await evidence(page, testInfo, 'shape-layer');
    expect(errors).toEqual([]);
  });

  test('color overlay recolors the layer and toggles off again', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const before = await canvasStats(page);
    await toggleEffect(page, 'Color Overlay');
    await setEffectColor(page, 'Color Overlay', '#ff3b30');

    const recolored = await canvasStats(page);
    expect(recolored.red).toBeGreaterThan(before.red + 100);
    expect(recolored.blue).toBeLessThan(before.blue / 2);
    await evidence(page, testInfo, 'color-overlay-on');

    await toggleEffect(page, 'Color Overlay');
    const restored = await canvasStats(page);
    expect(restored.blue).toBeGreaterThan(before.blue / 2);
    await evidence(page, testInfo, 'color-overlay-off');

    expect(errors).toEqual([]);
  });

  test('stroke draws outside and inside the silhouette', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const before = await canvasStats(page);
    await toggleEffect(page, 'Stroke');
    await setRangeByLabel(page, 'Width', 24);

    const outside = await canvasStats(page);
    expect(outside.white).toBeGreaterThan(before.white + 50);
    await evidence(page, testInfo, 'stroke-outside');

    await page.getByRole('button', { name: 'inside', exact: true }).click();
    await page.waitForTimeout(300);
    const inside = await canvasStats(page);
    expect(inside.white).toBeGreaterThan(before.white + 50);
    await evidence(page, testInfo, 'stroke-inside');

    expect(errors).toEqual([]);
  });

  test('inner shadow darkens and inner glow brightens the interior', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const baseline = await canvasStats(page);

    await toggleEffect(page, 'Inner Shadow');
    const shadowed = await canvasStats(page);
    expect(shadowed.luma).toBeLessThan(baseline.luma - 2);
    await evidence(page, testInfo, 'inner-shadow');

    await toggleEffect(page, 'Inner Shadow');
    await toggleEffect(page, 'Inner Glow');
    const glowing = await canvasStats(page);
    expect(glowing.luma).toBeGreaterThan(baseline.luma + 2);
    await evidence(page, testInfo, 'inner-glow');

    expect(errors).toEqual([]);
  });

  test('undo and redo restore the effect state', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const overlayBox = page.getByRole('checkbox', { name: 'Color Overlay' });
    await toggleEffect(page, 'Color Overlay');
    await expect(overlayBox).toBeChecked();

    await blurActive(page);
    await page.keyboard.press('Control+z');
    await expect(overlayBox).not.toBeChecked();
    await evidence(page, testInfo, 'undo-overlay');

    await page.keyboard.press('Control+Shift+z');
    await expect(overlayBox).toBeChecked();
    await evidence(page, testInfo, 'redo-overlay');

    expect(errors).toEqual([]);
  });

  test('arrow keys nudge the active layer and undo restores its position', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await addShapeLayer(page);

    const xField = page.getByRole('spinbutton', { name: 'X' });
    const originalX = Number(await xField.inputValue());

    await blurActive(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(xField).toHaveValue(String(originalX + 2));

    // Each nudge commits its own history entry, so undo twice.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    await expect(xField).toHaveValue(String(originalX));

    expect(errors).toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasCenter,
  canvasStats,
  clickCanvas,
  collectPageErrors,
  createBlankProject,
  evidence,
  layerCount,
  zoomActualPixels,
} from './helpers';

test.describe('Shape tool', () => {
  test('dragging on the canvas previews and then creates a shape layer', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    expect(await layerCount(page)).toBe(1);

    await blurActive(page);
    await page.keyboard.press('u');
    await expect(page.getByText('Shape', { exact: true })).toBeVisible();

    const center = await canvasCenter(page);
    await page.mouse.move(center.x - 140, center.y - 140);
    await page.mouse.down();
    await page.mouse.move(center.x + 140, center.y + 140, { steps: 12 });
    await page.waitForTimeout(150);

    // Mid-drag the dashed preview is drawn without committing a layer yet.
    await evidence(page, testInfo, 'shape-drag-preview');
    expect(await layerCount(page)).toBe(1);

    await page.mouse.up();
    await page.waitForTimeout(400);

    await expect(page.getByText('Rounded Rect 1', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    const stats = await canvasStats(page);
    expect(stats.blue).toBeGreaterThan(200);

    await expect(page.getByRole('spinbutton', { name: 'Width' })).not.toHaveValue('600');
    await evidence(page, testInfo, 'shape-created');
    expect(errors).toEqual([]);
  });

  test('shape kind selector creates an ellipse', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('u');
    await page.locator('select:has(option[value="ellipse"])').selectOption('ellipse');

    await page.mouse.move((await canvasCenter(page)).x - 120, (await canvasCenter(page)).y - 120);
    await page.mouse.down();
    await page.mouse.move((await canvasCenter(page)).x + 120, (await canvasCenter(page)).y + 120, {
      steps: 12,
    });
    await page.mouse.up();
    await page.waitForTimeout(400);

    await expect(page.getByText('Ellipse 1', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    const stats = await canvasStats(page);
    expect(stats.blue).toBeGreaterThan(200);

    await evidence(page, testInfo, 'ellipse-created');
    expect(errors).toEqual([]);
  });

  test('a click without a drag creates the minimum 24×24 shape', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('u');
    await clickCanvas(page, { dx: -80, dy: 80 });

    expect(await layerCount(page)).toBe(2);
    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('24');
    await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('24');
    expect(errors).toEqual([]);
  });
});

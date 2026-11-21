import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasStats,
  collectPageErrors,
  createBlankProject,
  dragOnCanvas,
  evidence,
  openMenu,
  zoomActualPixels,
} from './helpers';

test.describe('Crop & resize', () => {
  test('crop to selection resizes the document', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('m');
    await dragOnCanvas(page, { dx: -120, dy: -120 }, { dx: 120, dy: 120 });

    await openMenu(page, 'Image');
    await page.getByRole('button', { name: /Crop to Selection/ }).click();
    await page.waitForTimeout(500);

    const width = Number(await page.getByRole('spinbutton', { name: 'Width' }).inputValue());
    const height = Number(await page.getByRole('spinbutton', { name: 'Height' }).inputValue());
    expect(width).toBeGreaterThan(180);
    expect(width).toBeLessThan(320);
    expect(height).toBeGreaterThan(180);
    expect(height).toBeLessThan(320);

    const stats = await canvasStats(page);
    expect(stats.samples).toBeGreaterThan(100);

    await evidence(page, testInfo, 'cropped-document');
    expect(errors).toEqual([]);
  });

  test('crop tool applies its default frame with Enter', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { width: 600, height: 600 });
    await zoomActualPixels(page);

    const widthField = page.getByRole('spinbutton', { name: 'Width' });
    expect(Number(await widthField.inputValue())).toBe(600);

    await blurActive(page);
    await page.keyboard.press('c');
    await expect(page.getByText(/^Crop · /)).toBeVisible();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    expect(Number(await widthField.inputValue())).toBe(600);
    expect(Number(await page.getByRole('spinbutton', { name: 'Height' }).inputValue())).toBe(600);
    expect(errors).toEqual([]);
  });

  test('resize image scales the document and keeps its content', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White', width: 600, height: 600 });
    await zoomActualPixels(page);

    await openMenu(page, 'Image');
    await page.getByRole('button', { name: /Resize Image/ }).click();

    const modal = page.locator('form').filter({ hasText: 'Resize Image' });
    await expect(modal.getByRole('heading', { name: 'Resize Image' })).toBeVisible();
    await modal.locator('input[type="number"]').nth(0).fill('300');

    // Aspect ratio is locked, so height follows width.
    await expect(modal.locator('input[type="number"]').nth(1)).toHaveValue('300');
    await modal.getByRole('button', { name: 'Resize', exact: true }).click();
    await page.waitForTimeout(500);

    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('300');
    await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('300');

    const stats = await canvasStats(page);
    expect(stats.samples).toBeGreaterThan(100);

    await evidence(page, testInfo, 'resized-document');
    expect(errors).toEqual([]);
  });
});

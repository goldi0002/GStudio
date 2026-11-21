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

test.describe('Text layers', () => {
  test('text tool opens the editor and renders a layer with the chosen content', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('t');
    await clickCanvas(page);

    const modal = page.locator('form').filter({ hasText: 'Edit Text Layer' });
    await expect(modal.getByRole('heading', { name: 'Edit Text Layer' })).toBeVisible();
    await modal.locator('textarea').fill('Hello GStudio');
    await modal.locator('input[type="number"]').fill('96');

    await modal.locator('input[type="color"]').evaluate((input) => {
      const el = input as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, '#FF0000');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await modal.getByRole('button', { name: 'Apply Text' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Hello GStudio', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    const stats = await canvasStats(page);
    expect(stats.red).toBeGreaterThan(5);

    await evidence(page, testInfo, 'text-layer');
    expect(errors).toEqual([]);
  });

  test('double-clicking a text layer reopens the editor and updates it', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('t');
    await clickCanvas(page);
    const modal = page.locator('form').filter({ hasText: 'Edit Text Layer' });
    await modal.locator('textarea').fill('First Draft');
    await modal.getByRole('button', { name: 'Apply Text' }).click();
    await page.waitForTimeout(400);

    await blurActive(page);
    await page.keyboard.press('v');
    const center = await canvasCenter(page);
    await page.mouse.dblclick(center.x + 30, center.y + 30);

    const reopened = page.locator('form').filter({ hasText: 'Edit Text Layer' });
    await expect(reopened.locator('textarea')).toHaveValue('First Draft');
    await reopened.locator('textarea').fill('Edited Copy');
    await reopened.getByRole('button', { name: 'Apply Text' }).click();
    await page.waitForTimeout(400);

    await expect(page.getByText('Edited Copy', { exact: true })).toBeVisible();
    await expect(page.getByText('First Draft', { exact: true })).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});

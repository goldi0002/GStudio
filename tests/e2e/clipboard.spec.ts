import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  blurActive,
  collectPageErrors,
  createBlankProject,
  disableNativePickers,
  dragOnCanvas,
  evidence,
  layerCount,
  zoomActualPixels,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await disableNativePickers(page);
});

test.describe('Clipboard', () => {
  test('copy then paste duplicates the active layer', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    expect(await layerCount(page)).toBe(1);

    await blurActive(page);
    await page.keyboard.press('Control+c');
    await expect(page.getByText('Copied "Background"')).toBeVisible();

    await page.keyboard.press('Control+v');
    await expect(page.getByText('Background Pasted', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    // Undo the duplicate so the layer stack is back to one layer.
    await blurActive(page);
    await page.keyboard.press('Control+z');
    await expect.poll(() => layerCount(page)).toBe(1);

    await evidence(page, testInfo, 'copy-paste-layer');
    expect(errors).toEqual([]);
  });

  test('copy merged extracts the selection and pastes it as a layer', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('m');
    await dragOnCanvas(page, { dx: -120, dy: -120 }, { dx: 120, dy: 120 });

    await page.keyboard.press('Control+Shift+c');
    await expect(page.getByText('Copied merged composite')).toBeVisible();

    await page.keyboard.press('Control+v');
    await expect(page.getByText('E2E Canvas Merged Pasted', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    await evidence(page, testInfo, 'copy-merged-paste');
    expect(errors).toEqual([]);
  });

  test('cut removes the active layer and paste brings it back', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { background: 'White' });
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('Control+Shift+n');
    await expect.poll(() => layerCount(page)).toBe(2);
    const created = await page
      .locator('button[title="Hide Layer"], button[title="Show Layer"]')
      .first()
      .locator('..')
      .innerText();

    await blurActive(page);
    await page.keyboard.press('Control+x');
    await expect.poll(() => layerCount(page)).toBe(1);

    await blurActive(page);
    await page.keyboard.press('Control+v');
    await expect.poll(() => layerCount(page)).toBe(2);
    await expect(page.getByText(/Pasted$/, { exact: false })).toBeVisible();

    await evidence(page, testInfo, 'cut-paste-layer');
    expect(created.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('pasting an image from the OS clipboard adds it as a layer', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);
    expect(await layerCount(page)).toBe(1);

    const base64 = fs
      .readFileSync(path.resolve('tests/fixtures/blue-800x600.png'))
      .toString('base64');

    await page.evaluate((data) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'clipboard.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      window.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true })
      );
    }, base64);

    await expect(page.getByText('Pasted image from clipboard')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Pasted Image', { exact: true })).toBeVisible();
    expect(await layerCount(page)).toBe(2);

    await evidence(page, testInfo, 'clipboard-image-paste');
    expect(errors).toEqual([]);
  });
});

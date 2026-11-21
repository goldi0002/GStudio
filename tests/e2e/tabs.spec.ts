import { test, expect } from '@playwright/test';
import {
  blurActive,
  collectPageErrors,
  createBlankProject,
  createNewDocument,
  disableNativePickers,
  evidence,
  zoomActualPixels,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await disableNativePickers(page);
});

test.describe('Multi-document tabs', () => {
  test('opening a second document adds a tab and switching restores its state', async ({
    page,
  }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });
    await zoomActualPixels(page);
    await expect(page.getByRole('button', { name: 'Close Alpha' })).toBeVisible();

    await createNewDocument(page, { name: 'Beta', width: 320, height: 240 });
    await expect(page.getByRole('button', { name: 'Close Beta' })).toBeVisible();

    const widthField = page.getByRole('spinbutton', { name: 'Width' });
    await expect(widthField).toHaveValue('320');
    await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('240');
    await evidence(page, testInfo, 'second-document-tab');

    await page.getByRole('button', { name: 'Close Alpha' }).locator('..').click();
    await page.waitForTimeout(300);
    await expect(widthField).toHaveValue('600');
    await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('600');
    await evidence(page, testInfo, 'switched-to-first-tab');

    expect(errors).toEqual([]);
  });

  test('closing a tab falls back to the remaining document', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });
    await zoomActualPixels(page);
    await createNewDocument(page, { name: 'Beta', width: 320, height: 240 });

    await page.getByRole('button', { name: 'Close Beta' }).click();
    await expect(page.getByRole('button', { name: 'Close Beta' })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('600');

    expect(errors).toEqual([]);
  });

  test('Ctrl+W closes the active tab', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });
    await zoomActualPixels(page);
    await createNewDocument(page, { name: 'Beta', width: 320, height: 240 });

    await blurActive(page);
    await page.keyboard.press('Control+w');
    await expect(page.getByRole('button', { name: 'Close Beta' })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('600');

    expect(errors).toEqual([]);
  });
});

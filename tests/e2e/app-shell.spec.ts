import { test, expect } from '@playwright/test';
import { collectPageErrors, evidence, openSample, openWelcome } from './helpers';

test.describe('App shell', () => {
  test('opens the keyboard shortcuts reference', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openWelcome(page);

    await page.keyboard.press('?');
    await expect(page.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeVisible();
    await expect(page.getByText('Toggle Before / After Split')).toBeVisible();
    await expect(page.getByText('⌘Z / ⇧⌘Z')).toBeVisible();

    await evidence(page, testInfo, 'shortcuts-modal');
    expect(errors).toEqual([]);
  });

  test('theme toggle survives a reload', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openWelcome(page);

    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Switch to Light Appearance' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await evidence(page, testInfo, 'light-theme');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ready to edit locally' })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    expect(errors).toEqual([]);
  });

  test('autosaved work appears under Recent Projects', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Alpine Dawn Horizon');

    // Autosave debounce is 1.1s in the store.
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Home Screen' }).click();

    const recent = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Recent Projects' }) });
    await expect(recent.getByText('Alpine Dawn Horizon')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Autosaved locally in IndexedDB')).toBeVisible();
    await expect(recent.getByRole('img', { name: 'Alpine Dawn Horizon' })).toBeVisible();

    await evidence(page, testInfo, 'recent-projects');
    expect(errors).toEqual([]);
  });
});

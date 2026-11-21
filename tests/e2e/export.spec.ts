import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  blurActive,
  collectPageErrors,
  disableNativePickers,
  evidence,
  openSample,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await disableNativePickers(page);
});

test.describe('Export & project files', () => {
  test('export modal renders a live preview and switches format', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Color & Alpha Calibration');
    await blurActive(page);
    await page.keyboard.press('Control+e');

    await expect(page.getByRole('heading', { name: 'Export Image' })).toBeVisible();
    const preview = page.locator('img[alt="Export preview"]');
    await expect(preview).toBeVisible({ timeout: 10_000 });
    await expect(preview).toHaveAttribute('src', /^(blob:|data:image)/);

    await page.getByRole('button', { name: 'webp', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export WEBP' })).toBeVisible();
    await expect(preview).toBeVisible();

    await evidence(page, testInfo, 'export-modal');
    expect(errors).toEqual([]);
  });

  test('exports a PNG file through a real download', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');
    await blurActive(page);
    await page.keyboard.press('Control+e');
    await expect(page.locator('img[alt="Export preview"]')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'png', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PNG' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const size = fs.statSync(filePath as string).size;
    expect(size).toBeGreaterThan(1024);

    await evidence(page, testInfo, 'export-downloaded');
    expect(errors).toEqual([]);
  });

  test('saves a .lps project and reopens it', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');
    await blurActive(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+Shift+s'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.lps$/);

    const filePath = (await download.path()) as string;
    const project = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      formatVersion: number;
      name: string;
      width: number;
      height: number;
      layers: unknown[];
    };
    expect(project.formatVersion).toBe(1);
    expect(project.layers.length).toBeGreaterThan(0);
    expect(project.width).toBeGreaterThan(0);
    expect(project.height).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Home Screen' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /Load \.lps Project/ }).click(),
    ]);
    await chooser.setFiles(filePath);

    await expect(page.getByRole('button', { name: 'Add Shape Layer' })).toBeVisible();
    await expect(page.getByText(project.name).first()).toBeVisible();

    await evidence(page, testInfo, 'lps-reopened');
    expect(errors).toEqual([]);
  });
});

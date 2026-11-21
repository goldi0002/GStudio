import { test, expect } from '@playwright/test';
import {
  canvasStats,
  collectPageErrors,
  createBlankProject,
  evidence,
  openSample,
  openWelcome,
} from './helpers';

test.describe('Welcome screen', () => {
  test('renders entry points, samples and the privacy promise', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openWelcome(page);

    await expect(page.getByRole('button', { name: /New Project/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Image/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Open Project \(\.lps\)/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Batch Process/ }).first()).toBeVisible();

    await expect(page.getByText('Private & Offline Ready')).toBeVisible();
    await expect(page.getByText('No cloud uploads or accounts required.')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Try with Bundled Studio Samples' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Alpine Dawn Horizon' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sunlit Courtyard Study' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Color & Alpha Calibration' })).toBeVisible();

    await evidence(page, testInfo, 'welcome');
    expect(errors).toEqual([]);
  });

  test('creates a blank project and enters the editor', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { name: 'E2E Canvas', width: 600, height: 600 });

    await expect(page.getByText('E2E Canvas').first()).toBeVisible();
    await expect(page.getByText('Background').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Raster Layer' })).toBeVisible();

    await evidence(page, testInfo, 'editor-created');
    expect(errors).toEqual([]);
  });

  test('opens a bundled sample with rendered pixels', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    const stats = await canvasStats(page);
    expect(stats.samples).toBeGreaterThan(500);
    expect(stats.colorful).toBeGreaterThan(50);

    await evidence(page, testInfo, 'sample-open');
    expect(errors).toEqual([]);
  });
});

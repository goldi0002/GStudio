import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectPageErrors,
  disableNativePickers,
  evidence,
  openWelcome,
} from './helpers';

const FIXTURES = ['red-640x480.png', 'blue-800x600.png'].map((name) =>
  path.resolve('tests/fixtures', name)
);

test.beforeEach(async ({ page }) => {
  await disableNativePickers(page);
});

test.describe('Batch processing', () => {
  test('queues two images, converts them to PNG and downloads both', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openWelcome(page);

    await page.getByRole('button', { name: /Batch Process/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Batch Process' })).toBeVisible();

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Add Images', exact: true }).click(),
    ]);
    await chooser.setFiles(FIXTURES);

    await expect(page.getByText('red-640x480', { exact: true })).toBeVisible();
    await expect(page.getByText('blue-800x600', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'batch-queued');

    await page.getByRole('button', { name: 'png', exact: true }).click();

    const downloads: string[] = [];
    page.on('download', async (download) => {
      const filePath = await download.path();
      if (filePath) downloads.push(download.suggestedFilename());
    });

    await page.getByRole('button', { name: /Process 2 images/ }).click();

    await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(2);
    expect(downloads.sort()).toEqual(['blue-800x600.png', 'red-640x480.png']);

    await expect(page.getByText('2/2 done')).toBeVisible();
    await evidence(page, testInfo, 'batch-done');

    expect(fs.existsSync(FIXTURES[0])).toBe(true);
    expect(errors).toEqual([]);
  });
});

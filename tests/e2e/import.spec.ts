import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  collectPageErrors,
  createBlankProject,
  evidence,
  zoomActualPixels,
} from './helpers';

/** Dispatch a native drag event carrying the fixture PNG onto the app shell. */
async function dragFileOntoApp(page: import('@playwright/test').Page, type: string): Promise<void> {
  const base64 = fs
    .readFileSync(path.resolve('tests/fixtures/blue-800x600.png'))
    .toString('base64');
  await page.evaluate(
    ({ data, type }) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'blue-800x600.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const target = (document.querySelector('#root > div') ??
        document.querySelector('#root')) as HTMLElement;
      target.dispatchEvent(
        new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true })
      );
    },
    { data: base64, type }
  );
}

test.describe('Drag & drop import', () => {
  test('dropping an image file opens it in a new tab', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await dragFileOntoApp(page, 'dragover');
    await expect(
      page.getByText('Drop image or .lps project to open in new tab', { exact: true })
    ).toBeVisible();
    await evidence(page, testInfo, 'drag-overlay');

    await dragFileOntoApp(page, 'drop');
    await expect(page.getByRole('button', { name: 'Add Shape Layer' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('blue-800x600', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('800');
    await expect(page.getByRole('spinbutton', { name: 'Height' })).toHaveValue('600');

    await evidence(page, testInfo, 'dropped-image-tab');
    expect(errors).toEqual([]);
  });
});

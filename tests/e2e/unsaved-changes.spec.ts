import { test, expect, type Page } from '@playwright/test';
import {
  blurActive,
  collectPageErrors,
  createBlankProject,
  createNewDocument,
  disableNativePickers,
  dragOnCanvas,
  openSample,
  zoomActualPixels,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await disableNativePickers(page);
});

/**
 * Make project saves fail the way a full or blocked IndexedDB quota would.
 * Settings writes keep working, and the store degrades gracefully, so editor
 * documents stay genuinely unsaved for the whole test instead of becoming
 * "saved" after the 1.1s autosave debounce.
 */
async function blockProjectSaves(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      if (this.keyPath === 'id') {
        throw new DOMException('Project storage is unavailable', 'QuotaExceededError');
      }
      return key === undefined
        ? put.call(this, value as never)
        : put.call(this, value as never, key);
    } as typeof put;
  });
}

/** Fire the same beforeunload event the browser sends and report whether the app blocked it. */
async function beforeUnloadPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

/** Paint one stroke so the document revision changes. */
async function paintStroke(page: Page): Promise<void> {
  await zoomActualPixels(page);
  await blurActive(page);
  await page.keyboard.press('b');
  await dragOnCanvas(page, { dx: -120, dy: 0 }, { dx: 120, dy: 0 });
}

test.describe('Unsaved changes guard', () => {
  test('a saved document closes without a prompt', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });

    // Wait for the autosave to actually persist the document instead of
    // sleeping for the debounce duration.
    await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close Alpha' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsaved Changes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close Alpha' })).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('Cancel keeps an unsaved document open', async ({ page }) => {
    const errors = collectPageErrors(page);
    await blockProjectSaves(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });
    await paintStroke(page);
    await expect(page.getByText('Modified', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close Alpha' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close Alpha' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Discard & Close closes an unsaved document', async ({ page }) => {
    const errors = collectPageErrors(page);
    await blockProjectSaves(page);
    await createBlankProject(page, { name: 'Alpha', width: 600, height: 600 });
    await createNewDocument(page, { name: 'Beta', width: 320, height: 240 });
    await paintStroke(page);
    await expect(page.getByText('Modified', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close Beta' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved Changes' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard & Close' }).click();

    await expect(page.getByRole('button', { name: 'Close Beta' })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('600');

    expect(errors).toEqual([]);
  });

  test('beforeunload is only blocked while a document has unsaved changes', async ({ page }) => {
    await blockProjectSaves(page);
    await openSample(page);
    expect(await beforeUnloadPrevented(page)).toBe(false);

    await paintStroke(page);
    await expect(page.getByText('Modified', { exact: true })).toBeVisible();
    expect(await beforeUnloadPrevented(page)).toBe(true);
  });
});

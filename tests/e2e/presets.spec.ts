import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors, evidence, openSample, setRangeByLabel } from './helpers';

const PRESET_STORAGE_KEY = 'gstudio.adjustmentPresets.v1';
const FULL_MESSAGE = 'Could not save preset. My Presets may be full or storage is unavailable.';

/** Read the numeric value shown next to an adjustment slider label. */
async function adjustmentValue(page: Page, label: string): Promise<string> {
  return page.evaluate((label) => {
    const ranges = Array.from(
      document.querySelectorAll('input[type="range"]')
    ) as HTMLInputElement[];
    const target = ranges.find((input) =>
      (input.parentElement?.textContent || '').trim().startsWith(label)
    );
    return target?.value ?? '';
  }, label);
}

/** All saved-preset rows currently rendered in the My Presets list. */
function presetRows(page: Page) {
  return page.getByTitle(/^Apply preset /);
}

async function savePresetViaUi(page: Page, name: string): Promise<void> {
  await page.getByLabel('Preset name').fill(name);
  await page.getByRole('button', { name: 'Save preset' }).click();
}

test.describe('My Presets', () => {
  test('saves the current adjustments under a name', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    await setRangeByLabel(page, 'Brightness', 45);
    await savePresetViaUi(page, 'Warm Film');

    await expect(page.getByText('Saved preset “Warm Film”.')).toBeVisible();
    await expect(presetRows(page)).toHaveCount(1);
    await expect(page.getByTitle('Apply preset Warm Film', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Preset name')).toHaveValue('');

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), PRESET_STORAGE_KEY);
    expect(stored).toContain('Warm Film');

    await evidence(page, testInfo, 'saved');
    expect(errors).toEqual([]);
  });

  test('applies a saved preset to the document', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    await setRangeByLabel(page, 'Brightness', 45);
    await savePresetViaUi(page, 'Warm Film');
    await expect(presetRows(page)).toHaveCount(1);

    // Move away from the saved look, then reapply it.
    await setRangeByLabel(page, 'Brightness', -30);
    await expect.poll(() => adjustmentValue(page, 'Brightness')).toBe('-30');

    await page.getByTitle('Apply preset Warm Film', { exact: true }).click();
    await expect.poll(() => adjustmentValue(page, 'Brightness')).toBe('45');
    expect(errors).toEqual([]);
  });

  test('deletes a saved preset', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    await savePresetViaUi(page, 'Keep Me');
    await savePresetViaUi(page, 'Delete Me');
    await expect(presetRows(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Delete preset Delete Me' }).click();

    await expect(page.getByText('Deleted preset “Delete Me”.')).toBeVisible();
    await expect(presetRows(page)).toHaveCount(1);
    await expect(page.getByTitle('Apply preset Delete Me', { exact: true })).toHaveCount(0);
    await expect(page.getByTitle('Apply preset Keep Me', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('re-using a name replaces the preset instead of duplicating it', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openSample(page, 'Sunlit Courtyard Study');

    await setRangeByLabel(page, 'Brightness', 20);
    await savePresetViaUi(page, 'Sunset');
    await expect(presetRows(page)).toHaveCount(1);

    // Same name in a different case still overwrites the existing preset.
    await setRangeByLabel(page, 'Brightness', 70);
    await savePresetViaUi(page, 'sunset');

    await expect(presetRows(page)).toHaveCount(1);
    await expect(page.getByTitle('Apply preset sunset', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Apply preset Sunset', { exact: true })).toHaveCount(0);

    await setRangeByLabel(page, 'Brightness', 0);
    await page.getByTitle('Apply preset sunset', { exact: true }).click();
    await expect.poll(() => adjustmentValue(page, 'Brightness')).toBe('70');
    expect(errors).toEqual([]);
  });

  test('stops at 30 presets and reports the full list', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);

    // Seed 29 presets before the app boots so the 30th save is the last slot.
    await page.addInitScript(
      ({ key, count }) => {
        const presets = Array.from({ length: count }, (_, index) => ({
          id: `seed_${index}`,
          name: `Seed ${index + 1}`,
          createdAt: index,
          adjustments: { brightness: index },
        }));
        window.localStorage.setItem(key, JSON.stringify(presets));
      },
      { key: PRESET_STORAGE_KEY, count: 29 }
    );
    await openSample(page, 'Sunlit Courtyard Study');
    await expect(presetRows(page)).toHaveCount(29);

    await savePresetViaUi(page, 'Last Slot');
    await expect(page.getByText('Saved preset “Last Slot”.')).toBeVisible();
    await expect(presetRows(page)).toHaveCount(30);

    await savePresetViaUi(page, 'Overflow');
    await expect(page.getByText(FULL_MESSAGE)).toBeVisible();
    await expect(presetRows(page)).toHaveCount(30);
    await expect(page.getByTitle('Apply preset Overflow', { exact: true })).toHaveCount(0);

    await evidence(page, testInfo, 'cap-30');
    expect(errors).toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import {
  blurActive,
  canvasStats,
  clickCanvas,
  collectPageErrors,
  createBlankProject,
  dragOnCanvas,
  evidence,
  zoomActualPixels,
} from './helpers';

test.describe('Painting tools', () => {
  test('paint bucket floods the layer with the foreground color', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    const before = await canvasStats(page);
    expect(before.blue).toBeLessThan(20);

    await blurActive(page);
    await page.keyboard.press('g');
    await expect(page.getByText(/^Paint Bucket · /)).toBeVisible();
    await clickCanvas(page);

    const after = await canvasStats(page);
    expect(after.blue).toBeGreaterThan(500);

    await evidence(page, testInfo, 'bucket-fill');
    expect(errors).toEqual([]);
  });

  test('brush paints a stroke that the eraser removes again', async ({ page }, testInfo) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await zoomActualPixels(page);

    await blurActive(page);
    await page.keyboard.press('b');
    await dragOnCanvas(page, { dx: -150, dy: 0 }, { dx: 150, dy: 0 });

    const painted = await canvasStats(page);
    expect(painted.blue).toBeGreaterThan(100);
    await evidence(page, testInfo, 'brush-stroke');

    await page.keyboard.press('e');
    await dragOnCanvas(page, { dx: -150, dy: 0 }, { dx: 150, dy: 0 });

    const erased = await canvasStats(page);
    expect(erased.blue).toBeLessThan(painted.blue / 2);
    await evidence(page, testInfo, 'brush-erased');

    expect(errors).toEqual([]);
  });

  test('brush size responds to the [ and ] shortcuts', async ({ page }) => {
    const errors = collectPageErrors(page);
    await createBlankProject(page);
    await blurActive(page);
    await page.keyboard.press('b');

    // The options bar exposes brush size as a range; read its value through the DOM
    // so the assertion does not depend on a specific widget implementation.
    const readSize = () =>
      page.evaluate(() => {
        const ranges = Array.from(
          document.querySelectorAll('input[type="range"]')
        ) as HTMLInputElement[];
        const match = ranges.find((r) =>
          (r.parentElement?.textContent || '').toLowerCase().includes('size')
        );
        return match ? Number(match.value) : -1;
      });

    const initial = await readSize();
    expect(initial).toBeGreaterThan(0);

    await page.keyboard.press(']');
    await page.keyboard.press(']');
    const larger = await readSize();
    expect(larger).toBeGreaterThan(initial);

    await page.keyboard.press('[');
    const smaller = await readSize();
    expect(smaller).toBeLessThan(larger);

    expect(errors).toEqual([]);
  });
});

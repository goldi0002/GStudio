import { expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE_DIR = path.resolve('artifacts/e2e');

export interface CanvasStats {
  samples: number;
  blue: number;
  red: number;
  white: number;
  luma: number;
  colorful: number;
}

/** Collect uncaught page exceptions so tests can assert the app stayed clean. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Save a screenshot and attach it to the HTML report. */
export async function evidence(page: Page, testInfo: TestInfo, label: string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const slug = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const file = path.join(EVIDENCE_DIR, `${slug}--${label}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(label, { path: file, contentType: 'image/png' });
  return file;
}

/** Force the <input type="file"> and anchor-download fallbacks so tests can drive pickers. */
export async function disableNativePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const key of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
      try {
        Object.defineProperty(window, key, { value: undefined, configurable: true });
      } catch {
        // ignore
      }
    }
  });
}

export async function openWelcome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ready to edit locally' })).toBeVisible();
}

export async function createBlankProject(
  page: Page,
  options: {
    name?: string;
    width?: number;
    height?: number;
    background?: 'Transparent' | 'White' | 'Graphite';
  } = {}
): Promise<void> {
  const { name = 'E2E Canvas', width = 600, height = 600, background = 'Transparent' } = options;
  await openWelcome(page);
  await page.getByRole('button', { name: /^New Project/ }).first().click();
  const modal = page.locator('form').filter({ hasText: 'New Local Project' });
  await modal.locator('input[type="text"]').fill(name);
  const numbers = modal.locator('input[type="number"]');
  await numbers.nth(0).fill(String(width));
  await numbers.nth(1).fill(String(height));
  if (background !== 'Transparent') {
    await modal.getByRole('button', { name: background, exact: true }).click();
  }
  await modal.getByRole('button', { name: 'Create Canvas' }).click();
  await expect(page.getByRole('button', { name: 'Add Shape Layer' })).toBeVisible();
  await page.waitForTimeout(150);
}

export async function openSample(
  page: Page,
  name = 'Sunlit Courtyard Study'
): Promise<void> {
  await openWelcome(page);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
  await expect(page.getByRole('button', { name: 'Add Shape Layer' })).toBeVisible();
  await page.waitForTimeout(500);
}

/** Blur focused inputs so the app's global keyboard shortcuts fire. */
export async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Sample the display canvas. Only the central 40% is measured so that the
 * workspace backdrop and rulers don't dominate the averages.
 */
export async function canvasStats(page: Page): Promise<CanvasStats> {
  return page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find((c) =>
      (c.className || '').toString().includes('inset-0 w-full h-full')
    ) as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('Display canvas not found');

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');

    const x0 = Math.floor(canvas.width * 0.3);
    const x1 = Math.floor(canvas.width * 0.7);
    const y0 = Math.floor(canvas.height * 0.3);
    const y1 = Math.floor(canvas.height * 0.7);
    const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);

    let samples = 0;
    let blue = 0;
    let red = 0;
    let white = 0;
    let colorful = 0;
    let lumaSum = 0;

    for (let i = 0; i < data.length; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 10) continue;
      samples += 1;
      if (r < 80 && g > 90 && g < 190 && b > 200) blue += 1;
      if (r > 180 && g < 100 && b < 100) red += 1;
      if (r > 230 && g > 230 && b > 230) white += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 25) colorful += 1;
      lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    return {
      samples,
      blue,
      red,
      white,
      colorful,
      luma: samples > 0 ? lumaSum / samples : 0,
    };
  });
}

/** Zoom to 100% so document pixels map 1:1 to screen pixels. */
export async function zoomActualPixels(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '1:1', exact: true });
  if (await button.count()) await button.first().click();
  await page.waitForTimeout(250);
}

/** Center of the drawable canvas area in page coordinates. */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.mac-workspace-well').boundingBox();
  if (!box) throw new Error('Canvas workspace not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag in the canvas area using offsets from the canvas center. */
export async function dragOnCanvas(
  page: Page,
  from: { dx: number; dy: number },
  to: { dx: number; dy: number },
  steps = 12
): Promise<void> {
  const center = await canvasCenter(page);
  await page.mouse.move(center.x + from.dx, center.y + from.dy);
  await page.mouse.down();
  await page.mouse.move(center.x + to.dx, center.y + to.dy, { steps });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/** Click the canvas at an offset from its center. */
export async function clickCanvas(
  page: Page,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 }
): Promise<void> {
  const center = await canvasCenter(page);
  await page.mouse.click(center.x + offset.dx, center.y + offset.dy);
  await page.waitForTimeout(350);
}

/**
 * Create another document from inside the editor via Ctrl+N. Adds a tab and
 * makes the new document active.
 */
export async function createNewDocument(
  page: Page,
  options: {
    name?: string;
    width?: number;
    height?: number;
    background?: 'Transparent' | 'White' | 'Graphite';
  } = {}
): Promise<void> {
  const { name = 'Second Canvas', width = 600, height = 600, background = 'Transparent' } = options;
  await blurActive(page);
  await page.keyboard.press('Control+n');
  const modal = page.locator('form').filter({ hasText: 'New Local Project' });
  await expect(modal.getByRole('heading', { name: 'New Local Project' })).toBeVisible();
  await modal.locator('input[type="text"]').fill(name);
  const numbers = modal.locator('input[type="number"]');
  await numbers.nth(0).fill(String(width));
  await numbers.nth(1).fill(String(height));
  if (background !== 'Transparent') {
    await modal.getByRole('button', { name: background, exact: true }).click();
  }
  await modal.getByRole('button', { name: 'Create Canvas' }).click();
  await expect(page.getByRole('button', { name: 'Add Shape Layer' })).toBeVisible();
  await page.waitForTimeout(250);
}

/** Count layer rows in the inspector. */
export async function layerCount(page: Page): Promise<number> {
  return page.locator('button[title="Hide Layer"], button[title="Show Layer"]').count();
}

/** Set the foreground color from the sidebar swatch. */
export async function setForegroundColor(page: Page, hex: string): Promise<void> {
  const found = await page.evaluate((hex) => {
    const inputs = Array.from(
      document.querySelectorAll('input[type="color"]')
    ) as HTMLInputElement[];
    const target = inputs.find((input) =>
      (input.parentElement?.getAttribute('title') || '').startsWith('Foreground')
    );
    if (!target) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(target, hex);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, hex);
  if (!found) throw new Error('Foreground color input not found');
  await page.waitForTimeout(150);
}

/** Read one display-canvas pixel at an offset (CSS px) from the canvas center. */
export async function pixelAtOffset(
  page: Page,
  offset: { dx: number; dy: number }
): Promise<{ r: number; g: number; b: number; a: number }> {
  return page.evaluate(({ dx, dy }) => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find((c) =>
      (c.className || '').toString().includes('inset-0 w-full h-full')
    ) as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('Display canvas not found');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const px = Math.round((rect.width / 2 + dx) * sx);
    const py = Math.round((rect.height / 2 + dy) * sy);
    const d = ctx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }, offset);
}

/**
 * Offset (CSS px from the canvas center) of the before/after split boundary,
 * found by scanning the canvas row for the first adjusted pixel.
 */
export async function splitBoundaryOffsetX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll('canvas')).find((c) =>
      (c.className || '').toString().includes('inset-0 w-full h-full')
    ) as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('Display canvas not found');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const y = Math.round(canvas.height / 2);
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    for (let x = Math.round(canvas.width / 2); x < canvas.width; x += 1) {
      if (row[x * 4] < 200) return x / scaleX - rect.width / 2;
    }
    throw new Error('Split boundary not found');
  });
}

/** Open a top menu bar item (File, Image, Layer, …). */
export async function openMenu(page: Page, label: string): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: label, exact: true }).click();
}

/** Drive a controlled range input by its visible label (e.g. "Width", "Brightness"). */
export async function setRangeByLabel(page: Page, label: string, value: number): Promise<void> {
  const found = await page.evaluate(
    ({ label, value }) => {
      const ranges = Array.from(
        document.querySelectorAll('input[type="range"]')
      ) as HTMLInputElement[];
      const target = ranges.find((input) =>
        (input.parentElement?.textContent || '').trim().startsWith(label)
      );
      if (!target) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(target, String(value));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { label, value }
  );
  if (!found) throw new Error(`No range input labelled "${label}"`);
  await page.waitForTimeout(200);
}

/** Set a layer-effect color well (the color input inside the effect's header row). */
export async function setEffectColor(
  page: Page,
  effectName: string,
  hex: string
): Promise<void> {
  const found = await page.evaluate(
    ({ effectName, hex }) => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="color"]')
      ) as HTMLInputElement[];
      const target = inputs.find((input) =>
        (input.parentElement?.textContent || '').includes(effectName)
      );
      if (!target) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(target, hex);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { effectName, hex }
  );
  if (!found) throw new Error(`No color input for effect "${effectName}"`);
  await page.waitForTimeout(200);
}

/** Toggle a layer effect. Uses the last matching checkbox so shape-style rows are skipped. */
export async function toggleEffect(page: Page, name: string): Promise<void> {
  await page.getByRole('checkbox', { name }).last().click();
  await page.waitForTimeout(200);
}

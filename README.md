# GStudio

**Your images. Your device. Your control.**

GStudio is a privacy-first image editor that runs entirely in the browser. Nothing is uploaded: images are decoded, edited and exported on your device, and projects are saved locally in IndexedDB. It installs as a Progressive Web App and keeps working offline.

## Features

- **Layers** — raster, text and shape layers with blend modes, opacity, masks and layer styles; duplicate, reorder, nudge, resize and rotate.
- **Painting** — brush, eraser, paint bucket, linear and radial gradients, eyedropper.
- **Retouching** — clone stamp and spot healing brush.
- **Selections** — rectangular and elliptical marquee, lasso, magic wand; invert, fill, and mask from selection.
- **Adjustments** — exposure, colour and filter controls plus curves and levels, processed in a Web Worker. A before/after split view compares the result with the original.
- **Canvas** — crop, resize, zoom and pan.
- **Documents** — multiple open images in tabs, drag-and-drop import, clipboard copy/cut/paste, autosave with a Recent Projects list.
- **Export** — PNG, JPEG, WebP or BMP with size presets for social and print, plus batch processing of many files at once.
- **Projects** — save and reopen full layered projects as `.lps` files.

Import supports PNG, JPEG, WebP, AVIF, BMP, GIF and SVG.

## Getting started

Requires [Bun](https://bun.sh) (Node.js 22 works for running Vite and Playwright too).

```bash
bun install
bun run dev        # http://localhost:3000
```

## Scripts

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `bun run dev`        | Start the Vite dev server on port 3000               |
| `bun run build`      | Production build into `dist/` (with service worker)  |
| `bun run preview`    | Serve the production build                           |
| `bun run lint`       | Type-check with `tsc --noEmit`                       |
| `bun run test`       | Run the graphics engine unit tests                   |
| `bun run test:e2e`   | Run the Playwright end-to-end suite                  |
| `bun run fixtures`   | Regenerate the PNG fixtures used by the e2e tests    |
| `bun run clean`      | Remove `dist/`                                       |

The first time you run the end-to-end tests, install Playwright's browser with `bunx playwright install chromium`. The suite starts its own Vite server on port 4173.

## Keyboard shortcuts

A full list is in the app: press `?` or open View → Keyboard Shortcuts. The most common:

| Keys                  | Action                                  |
| --------------------- | --------------------------------------- |
| `V`                   | Move / resize / rotate                  |
| `M` / `O`             | Rectangular / elliptical marquee        |
| `L` / `W`             | Lasso / magic wand                      |
| `B` / `E`             | Brush / eraser                          |
| `G` / `K`             | Paint bucket / gradient                 |
| `S` / `J`             | Clone stamp / spot healing              |
| `T` / `U`             | Text / shape                            |
| `C`                   | Crop                                    |
| `[` / `]`             | Smaller / larger brush                  |
| `\`                   | Toggle before/after split               |
| `Space` + drag        | Pan                                     |
| `⌘Z` / `⇧⌘Z`          | Undo / redo                             |
| `⌘E` / `⌘S` / `⌘W`    | Export / save locally / close tab       |

On Windows and Linux, use `Ctrl` in place of `⌘`.

## Project layout

```
src/
  App.tsx                 App shell and global shortcuts
  components/             UI: toolbar, tool options, canvas workspace, inspector, modals
  engine/                 Canvas operations, adjustments (+ Web Worker), BMP encoder, unit tests
  persistence/            IndexedDB storage and file open/save
  store/useEditorStore.ts Zustand store holding all editor state
  types/                  Shared types
tests/
  e2e/                    Playwright specs
  fixtures/               Test images
scripts/make-fixtures.ts  Fixture generator
```

## Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand, Lucide icons, and `vite-plugin-pwa` (Workbox) for offline support.

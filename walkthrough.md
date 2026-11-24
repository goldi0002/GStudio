# Security Summary

**Reviewed Files**: 51
**Issues Resolved**: 6

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Untrusted Project Image URLs | `src/persistence/fileAccess.ts` | 499 | Imported `.lps` project files and IndexedDB project records passed `rasterDataUrl`, `maskDataUrl`, and `thumbnailDataUrl` straight into DOM `<img>` / `Image()` loaders without URL scheme validation, enabling outbound network beacons or `data:image/svg+xml` payloads. | High | Fixed | Added `isSafeRasterDataUrl` in `src/persistence/projectValidation.ts` (allowing only bounded base64 PNG/JPEG/WebP/GIF/BMP data URLs) and enforced it in `parseSerializedProject`, `deserializeProject`, `saveProjectToIndexedDb`, `listRecentProjectsFromIndexedDb`, and `src/components/WelcomeScreen.tsx`. |
| Unsanitized SVG Uploads | `src/persistence/fileAccess.ts` | 85 | User-opened or dropped `.svg` files were converted raw into an `image/svg+xml` Blob URL before rasterization without stripping executable elements or remote references. | High | Fixed | Added `sanitizeSvgMarkup` in `src/persistence/projectValidation.ts` to remove `<script>`, `<foreignObject>`, embedded frame/object tags, inline `on*` event handlers, dangerous `href`/`src` schemes, and remote CSS `url(...)` rules prior to creating the SVG Blob. |
| Unvalidated `.lps` Schema & Property Spreads | `src/persistence/projectValidation.ts` | 374 | `.lps` project JSON was parsed with `JSON.parse` across `App.tsx`, `TopToolbar.tsx`, and `WelcomeScreen.tsx` and deserialized with unchecked spreads (`...textData`, `...shapeData`), trusting arbitrary IDs, styles, blend modes, and numeric values. | Medium | Fixed | Created `parseSerializedProject` to enforce `formatVersion === 1`, layer count caps (`256`), safe IDs (blocking `__proto__`/`constructor`/`prototype` and broken `parentId` links), clamped adjustments/effects/font sizes, CSS-safe `fontFamily` & hex colors, and explicit field-by-field layer construction in `deserializeProject`. |
| Unbounded Canvas & Export Pixel Allocations | `src/persistence/projectValidation.ts` | 120 | Manual modal inputs, preset multipliers (`2x`, `200%`), project loads, and store resize actions could request oversized dimensions (`width * height` far exceeding safe browser memory limits), plus `ExportModal` could retain a revoked `blob:` preview URL when reopened. | Medium | Fixed | Added `constrainCanvasDimensions` (`8192` max edge and `40,000,000` max total pixels using floor downscaling), applied it across `useEditorStore.ts`, `fileAccess.ts`, and all dimension modals, and cleared `ExportModal` preview URL state whenever the modal closes. |
| Autosave Timer Race & Corrupt Storage Handling | `src/store/useEditorStore.ts` | 394 | A single global `autosaveTimer` could be overwritten across open document tabs, stale async IndexedDB saves could clear `dirty: false` after newer edits, toast IDs used `Date.now()`, and malformed IndexedDB entries could break recent-project listing. | Medium | Fixed | Replaced the single timer with a per-document `autosaveTimers` map, captured `documentRevision(doc)` before IndexedDB writes to avoid clearing `dirty` on stale saves, switched to monotonic toast IDs, and hardened `src/persistence/indexedDb.ts` connection caching and record guards. |
| Worker Failure Recovery & Dimension Guard | `src/engine/workerClient.ts` | 23 | Transient Web Worker errors permanently disabled background worker processing for the session, uncaught worker exceptions crashed the worker, and stale worker responses were not checked against current document dimensions. | Low | Fixed | Added `try/catch` structured error responses in `src/engine/adjustments.worker.ts`, added buffer/dimension validation and clean worker recreation in `src/engine/workerClient.ts`, and guarded `src/components/CanvasWorkspace.tsx` (`363`, `1680`) against stale dimension mismatches. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Client-Side Architecture & Secrets | `src/persistence/indexedDb.ts` | 100% local browser execution with IndexedDB, localStorage, and File System Access API; no backend routes, API keys, or third-party telemetry endpoints exist in `src/`. |
| DOM Rendering & Code Execution | `src/` | Zero instances of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `window.open`; all user strings render via escaped React JSX. |
| Static Deployment Security Headers | `vercel.json` | Configures `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, strict `Referrer-Policy`, and restrictive `Permissions-Policy` alongside no-cache rules for service worker assets. |
| Dependency Audit Scope | `package.json` | Checked runtime and dev dependencies (`bun audit`); only build-time transitive advisories inside `vite-plugin-pwa > workbox-build` (`glob`, `minimatch`) appear in tooling and are excluded from the browser bundle. |

---

## PoC Verification

### 1. Remote Tracking / SVG Payload in Imported `.lps` Project
#### Summary
| Field | Value |
|---|---|
| Issue Type | Untrusted Image & Mask URL Loading |
| Impact | High |
| Affected File | `src/persistence/projectValidation.ts:109` / `src/persistence/fileAccess.ts:494` |
| Test Scenario | `.lps` JSON file with `rasterDataUrl: "https://attacker.example/beacon.png"`, `maskDataUrl: "data:image/svg+xml;base64,PHN2Zy8+"`, and `thumbnailDataUrl: "https://attacker.example/thumb.png"` opened via file picker or drag-and-drop |

#### How It Was Fixed
`isSafeRasterDataUrl` enforces an explicit allowlist of base64-encoded raster data URLs (`png`, `jpeg`, `jpg`, `webp`, `gif`, `bmp`) with linear character validation and a 64 MB cap, and `parseSerializedProject` / `deserializeProject` validate both pixel layers and masks before any `Image()` element receives `.src`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `.lps` JSON enters `parseSerializedProject(JSON.parse(text))` at `src/App.tsx:457`, `src/components/TopToolbar.tsx:152`, or `src/components/WelcomeScreen.tsx:83`. | Parsed object enters validator |
| 2 | `parseSerializedProject` checks `isSafeRasterDataUrl(sl.maskDataUrl)` at `src/persistence/projectValidation.ts:422` and `isSafeRasterDataUrl(sl.rasterDataUrl)` at `src/persistence/projectValidation.ts:430`. | Non-base64 raster prefixes (`https://`, `data:image/svg+xml`) return `false` |
| 3 | Unsafe `thumbnailDataUrl` is cleared to `''` at `src/persistence/projectValidation.ts:495`, while unsafe layer/mask URLs throw an error before `deserializeProject` calls `loadHtmlImage`. | **Blocked Offline** |

#### Conclusion
**Fix Verified** - Opening crafted `.lps` files can no longer trigger outbound HTTP requests or load inline SVG images through layer, mask, or thumbnail fields.

---

### 2. Active Script & External Asset References in Uploaded SVG
#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsanitized SVG Rasterization Input |
| Impact | High |
| Affected File | `src/persistence/projectValidation.ts:569` / `src/persistence/fileAccess.ts:87` |
| Test Scenario | `.svg` file containing `<svg onload="alert(1)"><script>fetch("https://evil.example")</script><foreignObject><div>bad</div></foreignObject><image href="https://evil.example/leak.png" onclick="alert(2)" /><rect style="fill: url(https://evil.example/fill.png)" /></svg>` |

#### How It Was Fixed
`decodeImageFile` passes raw SVG text through `sanitizeSvgMarkup` before instantiating the SVG `Blob`, removing executable elements, event handler attributes, remote `href`/`src` attributes, and external CSS `url(...)` rules while preserving valid SVG vector shapes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | SVG `File` enters `decodeImageFile` at `src/persistence/fileAccess.ts:85`. | SVG text read into `rawSvgText` |
| 2 | `sanitizeSvgMarkup(rawSvgText)` runs at `src/persistence/fileAccess.ts:87` (`src/persistence/projectValidation.ts:569`), removing disallowed tags (`script`, `foreignobject`, `iframe`, `object`, `embed`, `applet`, `meta`, `base`), `on*` handlers, external `href`/`src` URLs, and remote CSS `url(...)` values. | Dangerous markup stripped |
| 3 | Only the sanitized output is passed to `new Blob([safeSvgText], { type: 'image/svg+xml;charset=utf-8' })` at `src/persistence/fileAccess.ts:88` for rasterizing onto a 2D `<canvas>`. | **Handled Safely** |

#### Conclusion
**Fix Verified** - Uploaded or pasted SVG images retain vector geometry while executable tags, inline handlers, and remote URL references are stripped prior to Blob creation.

---

### 3. Prototype Key Injection, Property Smuggling, and Oversized Canvas Allocation in `.lps`
#### Summary
| Field | Value |
|---|---|
| Issue Type | Schema Validation Bypass & Memory Exhaustion |
| Impact | Medium |
| Affected File | `src/persistence/projectValidation.ts:120` & `374` |
| Test Scenario | `.lps` payload containing `id: "__proto__"`, `width: 50000`, `height: 50000`, `backgroundColor: "url(https://attacker.example/x)"`, `adjustments: { brightness: 9999, filters: { blur: 500 } }`, `textData: { fontSize: 99999, fontFamily: "Arial; background: url(https://evil.example/f)", injectedKey: "should-drop" }` |

#### How It Was Fixed
`constrainCanvasDimensions` downscales oversized widths/heights with `Math.floor` so neither edge exceeds `8192` px nor total pixel count exceeds `40,000,000` px, while `parseSerializedProject` sanitizes IDs, strips unknown keys, validates CSS-safe fonts/hex colors, clamps numeric ranges, and verifies parent group IDs.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `parseSerializedProject` reads `width` and `height` and calls `constrainCanvasDimensions(50000, 50000)` at `src/persistence/projectValidation.ts:388`. | Clamped to `<= 8192` px and `<= 40,000,000` total pixels (`6324x6324`) |
| 2 | `sanitizeSafeId` at `src/persistence/projectValidation.ts:145` rejects `__proto__` / `constructor`, replacing them with safe generated IDs. | Prototype-key IDs eliminated |
| 3 | `sanitizeColor`, `sanitizeFontFamily`, `sanitizeTextData`, `sanitizeAdjustments`, and `deserializeProject` (`src/persistence/fileAccess.ts:551`) allowlist every property and clamp `brightness` (`100`), `blur` (`35`), and `fontSize` (`400`), dropping `injectedKey`. | **Normalized Safely** |

#### Conclusion
**Fix Verified** - Untrusted `.lps` files cannot allocate excessive canvas backing stores, inject prototype-key IDs, smuggle arbitrary layer fields, or bypass filter/effect bounds.

# Working on GStudio with multiple AI agents

GStudio is built by several agents. Work is split by GitHub label so nobody collides.

| Label | Agent | How it works |
| --- | --- | --- |
| `agent:freebuff` | FreeBuff | Picks up GitHub issues, opens a PR per issue. |
| `agent:ai-studio` | Google AI Studio | Cannot reach GitHub. Each issue contains a self-contained brief to paste into AI Studio; a human (or Claude) pastes the result back into the repo. |
| `agent:claude` | Claude Code | Larger or cross-cutting work: engine, store, persistence. |

## Rules for every agent

1. One issue = one branch = one PR. Branch name: `<agent>/<issue-number>-<slug>`.
2. Never push to `main`. A human merges.
3. Before opening a PR run `bun install`, `bun run lint` and `bun run test`. Both must pass. For UI changes also run the relevant Playwright spec (`bunx playwright test tests/e2e/<spec>.spec.ts`).
4. Add or extend a test for the behaviour you change. Pure logic goes in `src/engine/engine.test.ts` (plain `node:assert`, no DOM). UI behaviour goes in `tests/e2e/`.
5. Do not edit `src/store/useEditorStore.ts` or `src/engine/canvasOps.ts` unless the issue says so. These are shared hot spots; changes there are routed to `agent:claude`.
6. Do not add dependencies without saying why in the PR.
7. Keep everything client-side. No network calls, no telemetry, no uploading user images.
8. Do not touch `.github/`, `vercel.json` or `package.json` scripts unless the issue says so.

## Where things live

- `src/engine/`: pure image logic (adjustments, canvas ops, crop ratios, BMP encoder). Easy to test.
- `src/store/useEditorStore.ts`: Zustand store, all document mutations.
- `src/components/`: React UI. Right panel is `RightInspector.tsx`, tools are in `LeftToolSidebar.tsx`.
- `tests/e2e/helpers.ts`: Playwright helpers (`openSample`, `canvasStats`, `setRangeByLabel`, ...).

## Briefs for AI Studio

AI Studio issues include a "Brief" block. Paste it verbatim as the prompt. Ask for a single file, no dependencies, with named exports and the exact signature given. Then drop the file at the path listed in the issue and open a PR (or hand it to Claude to integrate and test).

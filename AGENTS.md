# Repository Guide for Coding Agents

## Product Scope

MarkCard Studio is a local-first Markdown-to-social-card authoring app, packaged as a 搭手（da-shou）plugin. Its core path is:

```text
Markdown source -> parse and paginate -> themed card preview -> PNG/JPG/PDF/long-PNG export
```

This repository implements one Vue workspace plus a Node 后台脚本 (the plugin core); it does not use Vue Router, Pinia, or TypeScript in the UI.

## Stack and Commands

- Package manager: `pnpm` (keep `pnpm-lock.yaml` authoritative).
- Frontend: Vue 3 `<script setup>`, JavaScript, Vite 6, Tailwind CSS 4, DaisyUI.
- Plugin core: Node (ESM), built by `dashou-plugin` into `src-dashou/core.mjs`.
- Editor/rendering: CodeMirror 6, markdown-it, Highlight.js, KaTeX, Mermaid, ECharts.
- Export: html-to-image and jsPDF.
- Internationalization: vue-i18n with Simplified Chinese and English resources.

```bash
pnpm install
pnpm dev                       # 前端 dev server（http://localhost:5177）
pnpm build                     # 前端产物 dist/
pnpm typecheck                 # src-dashou 的 tsc 检查
pnpm plugin:dev                # 起 dev server + 生成并 watch src-dashou/core.mjs
pnpm plugin:build              # 产出 src-dashou/dashou-dist/<id>-<version>.dsp
```

There is currently no automated test, lint, or format script. Do not claim those checks ran unless a script is added and executed.

## Architecture

The plugin model is **one core process + one window**; the window is a sandboxed page with no Node:

- `src/App.vue`: composes the three-panel workspace and wires document state to UI events.
- `src/composables/useStudioDocument.js`: primary state owner. Handles document lifecycle, undo/redo, settings/draft persistence, platform presets, parsing, measured-pagination orchestration, local image resolution, and page metadata.
- `src/composables/useContentParser.js`: converts Markdown source into render blocks, renders block HTML, and hydrates Mermaid/ECharts output.
- `src/composables/useMeasuredPagination.js`: mounts the shared card renderer offscreen, measures real DOM overflow, splits supported blocks, caches measurements, and marks unsplittable oversized blocks.
- `src/composables/useCardExport.js`: mounts the shared card renderer offscreen, prepares images/Mermaid/KaTeX/ECharts for capture, composites images onto the result canvas, and hands bytes to core for writing.
- `src/components/preview/CardArtwork.vue`: canonical card markup used by single preview, overview, measured pagination, and export. Card content or metadata changes belong here.
- `src/components/preview/`: live preview canvas, navigation, overview, and shared card artwork.
- `src/components/settings/`: platform, pagination, background, header/footer, and export controls.
- `src/config/themes.js` / `src/config/coverStickers.js`: theme catalog and theme-to-OpenMoji sticker mapping.
- `src/i18n/`: one translation resource file per locale plus persisted language and appearance preferences.
- `src/native/index.js`: the **only** exit point for host capabilities. Window code calls these wrappers; nothing else imports `@dashou/api` directly.
- `src/styles/themes/`: shared card CSS and one stylesheet per theme.
- `src-dashou/index.ts`: core entry — API table, `onCommand`, and the pending-document queue.
- `src-dashou/documents.ts`: Markdown dialogs, reads, and writes.
- `src-dashou/exports.ts`: export folder picker, subfolder/name sanitizing, base64 → file writes, reveal in file manager.
- `src-dashou/images.ts`: local image path resolution and remote image download (Node `fetch`, no CSP).
- `src-dashou/fonts.ts`: custom font library under `ctx.paths.data/custom-fonts`.

## Important Invariants

### Preview and Export Must Match

The live preview, pagination measurer, and exporter use separate DOM instances, but all must render card markup through `CardArtwork.vue`. Do not reintroduce hand-built export markup or duplicate card content in preview wrappers. Any change to card content, metadata visibility, dimensions, backgrounds, images, Mermaid, KaTeX, or theme styling must still be checked in preview, pagination, and export because their preparation and scaling steps differ.

Export capture deliberately inlines content images and CSS backgrounds, converts Mermaid SVGs, rasterizes KaTeX formulas and cover stickers, waits for decoded image dimensions, and composites Markdown images onto the final canvas. Local Markdown images are resolved to data URLs before pagination. Remote images use the browser first and the core resolver as a fallback. Preserve these preparation steps unless the replacement is verified with a representative document.

### Pagination Uses Real Card Measurements

Pagination is asynchronous and abortable. `useStudioDocument.js` creates a measured-pagination session for the selected platform, theme, and header/footer visibility settings. The session mounts `CardArtwork.vue` offscreen and uses actual `scrollHeight`/`clientHeight` values instead of estimated block heights.

Keep measurement hosts offscreen but rendered; do not use `display: none`, `visibility: hidden`, or inherited opacity. Wait for fonts, images, and Mermaid before trusting dimensions. When adding a splittable block type, update both the parser/rendering contract and `useMeasuredPagination.js`. Unsplittable oversized blocks must retain their `oversize` marker and visible warning.

### Document State Has One Main Owner

Add cross-panel document behavior to `useStudioDocument.js` and pass state/events through `App.vue`. Keep small UI-only state local to the owning component. Avoid introducing a global store for a narrow change.

Settings and draft data use versioned `localStorage` keys (the plugin window has a persistent, plugin-private origin). Treat stored settings as untrusted, keep validation/defaults when adding fields, and add new persistent fields to both the restore and save paths.

### Window and Core Split

- The window renders, edits, measures, and captures pixels. It never touches `node:*`, `electron`, or absolute filesystem paths.
- Anything that needs the filesystem, a system dialog, or an unrestricted remote download belongs in `src-dashou` and is exposed through `api`.
- Do not open dialogs from the window: every picker is a core API method, so the window needs no `dialog`/`fs` permissions at all.
- New host calls go through `src/native/index.js`; new core methods are added to the `api` table in `src-dashou/index.ts`.
- Keep `plugin.json` permissions to the minimum actually used. `dialog.save` needs `dialog:allow-save`, not just `dialog:allow-open`.

### Export Writes Go Through Core

The window produces a canvas; `saveExportFile` receives base64 and writes it under the chosen root. Sanitize subfolder and file names to a single path segment so a crafted document name cannot escape the export folder. Never pass a path from the page into `node:fs` without that sanitizing step.

### Host fetch is patched

The 搭手 SDK replaces `window.fetch` with a bridged implementation that only serves whitelisted http(s) hosts. Consequences:

- `plugin://` assets (stylesheets, fonts, wallpapers, stickers) must be fetched with `nativeFetch`.
- `useCardExport.js` wraps capture-time font/image work in `withNativeFetch(...)`; keep that wrapper or html-to-image will silently lose embedded fonts.
- Remote Markdown images fall back to the core resolver, because the page CSP blocks cross-origin `fetch`.

### Theme Changes Span Multiple Files

To add a theme:

1. Add its metadata to `src/config/themes.js`.
2. Add `src/styles/themes/theme-<name>.css`.
3. Import that stylesheet from `src/styles/themes/index.css`.
4. Add its cover stickers to `src/config/coverStickers.js`.

Use a stable `theme-<name>` id/class. Theme CSS must work for every platform ratio and in both preview and export. Do not remove OpenMoji attribution.

### Asset Paths Must Stay Relative

The window loads from `plugin://<id>/ui/index.html`, so `/stickers/x.svg` would resolve to the plugin root and 404. Use `assetUrl(...)` from `src/utils/asset.js` (or a `./`-prefixed path in `index.html`). Vite `base` must stay `'./'`.

## Code Conventions

- Follow the existing JavaScript and Vue `<script setup>` style; do not convert isolated files to TypeScript.
- Use 2-space indentation, double quotes in JavaScript, semicolons, and trailing commas where the surrounding file uses them.
- Define component contracts with `defineProps` and `defineEmits`. Keep event names in kebab case in templates.
- Reuse `AppIcon.vue` and Lucide names for interface icons.
- Prefer computed state over duplicated state and composables over unrelated utility dumping grounds.
- Keep comments brief and reserve them for rendering constraints, compatibility behavior, or non-obvious algorithms.
- Put user-facing strings in the matching locale file under `src/i18n/`, keep locale resources synchronized, and use one file per locale. Preserve stable internal ids when translating labels.
- Core error messages are shown to users verbatim: write finished sentences, no stack traces, no field names.
- Use structured APIs for Markdown, URLs, paths, and serialized settings; do not parse structured data with brittle string slicing when an existing parser is available.

## Change Playbooks

### Markdown Syntax or Pagination

- Update parsing/rendering in `useContentParser.js`, measurement/splitting in `useMeasuredPagination.js`, and orchestration in `useStudioDocument.js` as needed.
- Render measurement candidates through `CardArtwork.vue`; do not add a second simplified measurement template.
- Check empty documents, long paragraphs, explicit delimiters, code blocks, tables, images, KaTeX, and Mermaid.
- Verify overflow at Xiaohongshu 3:4, Douyin 9:16, square, and a custom size.
- Confirm rapid edits or settings changes abort stale pagination work and do not replace newer pages.

### Core File Behavior

- Implement the logic in the matching `src-dashou/*.ts` module and expose it from the `api` table.
- Add only the minimum capability permission required in `src-dashou/plugin.json`.
- Keep path validation and user-facing error messages at the core boundary.
- Keep remote image retrieval limited to HTTP/HTTPS, validate image content types, and retain explicit timeout, redirect, and response-size limits.
- Verify filenames and paths on macOS, Windows, and Linux semantics where relevant.

### Export Behavior

- Test PNG and JPG as multiple files, PDF as multiple pages, and long PNG as one stitched canvas.
- Test relative, absolute, and `file://` local Markdown images, including large PNG/JPEG/WebP files and multiple images across pages.
- Test a remote Markdown image, transparent output, built-in and custom wallpaper backgrounds, Mermaid, KaTeX, cover stickers, and all header/footer visibility toggles.
- Confirm local images are present in the saved files, not only in preview or the offscreen export DOM.
- Ensure output dimensions match the selected platform and that document-specific subfolder names are sanitized.

### Plugin Manifest or Permissions

- `id` is fixed after release; window `label` must be a lowercase literal.
- Capabilities that the core needs go in a `targets: ["core"]` capability — the window's grants do not apply to core.
- Re-run `pnpm plugin:build` after editing `src-dashou/plugin.json`; it validates permissions, scope, and asset paths.

## Validation Before Handoff

Run the smallest relevant checks, with these as the default baseline:

```bash
pnpm typecheck
pnpm build
pnpm plugin:build
```

For visual or export work, run `pnpm plugin:dev`, load `src-dashou/` in 搭手 开发者工具, and manually inspect at least one short document and one multipage rich document. Confirm that no card content overlaps, preview matches exported output, and exported pixel dimensions are correct.

Do not edit or commit generated directories such as `node_modules/`, `dist/`, `src-dashou/core.mjs`, `src-dashou/ui/`, or `src-dashou/dashou-dist/`. Preserve unrelated user changes in a dirty worktree.

## Documentation and Licensing

- `README.md` is the default English GitHub document.
- `README.zh-CN.md` is the synchronized Simplified Chinese version.
- Result examples live in `imgs/`; update both READMEs when the gallery changes materially.
- Project code is licensed under GNU GPL v3.0. Bundled third-party assets retain their own licenses.
- OpenMoji SVGs are CC BY-SA 4.0; attribution lives in `public/stickers/openmoji/README.md`.

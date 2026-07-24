@/home/stefano/.codex/RTK.md

--- project-doc ---

# AGENTS.md

## Project Scope

This directory is the standalone browser-only Z-Babel client. It runs a
WebAssembly build of the vendored Frotz/Jericho interpreter, loads a local
Z-machine story in the browser, and adds translation, STT, TTS, map, save, and
localized UI features without the Python server.

When Codex is launched from this directory, treat this directory as the project
root. Do not edit files outside this directory.

## Important Files

- `index.html`: browser UI shell.
- `src/app.js`: main app controller and UI wiring.
- `src/game-session.js`: Z-machine session state, command history, map state,
  save/restore state.
- `src/jericho-engine.mjs`: JavaScript wrapper around the WASM Frotz/Jericho
  module.
- `src/translation.js`: Gemini translation/STT prompts, model calls, and cache
  keys.
- `src/tts.js`: Gemini TTS calls and audio cache.
- `src/map.js`: Cytoscape map rendering.
- `src/storage.js`: IndexedDB saves, translation cache, and audio cache.
- `src/locales/{Language}.json`: UI text, tooltips, status strings, and map
  labels. Keep UI strings out of `app.js` when possible.
- `wasm/jericho_bridge.c`: standalone C bridge exported to WASM.
- `stories/905.z5`: bundled default story.
- `vendor/cytoscape-3.33.4.min.js`: pinned local map dependency.
- `test/*.mjs`, `test/*.cjs`, `test/*.html`: standalone checks.

## Commands

Useful commands from this directory:

```bash
make test
make wasm
make clean
node test/wasm-smoke.cjs
node test/game-session.test.mjs
node test/translation.test.mjs
python -m http.server 8000
```

After serving, open:

```text
http://localhost:8000/
```

## Browser/WASM Notes

- The generated `build/jericho.js` and `build/jericho.wasm` are build outputs.
  Rebuild with `make wasm` after changing `wasm/jericho_bridge.c` or the
  exported function list in `Makefile`.
- Browser module caching can cause stale `src/*.js`, `build/jericho.js`, or
  `build/jericho.wasm` to be loaded. If changing exported WASM symbols or module
  APIs, update query-string cache busters in `index.html` / `src/app.js`.
- Keep compatibility fallbacks for old save formats and browser data where
  practical. Current code still accepts old `.zaisave` imports and migrates old
  IndexedDB data.
- The deterministic boundary matters: Jericho receives canonical English
  commands. User-language text belongs in translation/UI layers only.

## Localization

- Keep user-facing UI text in `src/locales/{Language}.json`.
- If adding a new UI string, add it to both `English.json` and `Italian.json`.
- Keep locale keys stable and check both JSON files have matching keys.
- The UI language defaults to the target language; unsupported UI languages
  fall back to English.
- Room/status/map node names use `translateRoomName()` because short location
  names need location context. Do not replace that with generic output
  translation.

## AI Calls and Cache

- Translation/STT/TTS use the user's Gemini API key in the browser.
- Do not add hardcoded API keys.
- Avoid real paid/network AI calls in routine tests. Use mocked fetches or cache
  tests.
- Translation cache keys must include enough context: story, direction/type,
  language, model, prompt version, and source text.
- STT audio must not be cached. TTS generated audio may be cached.

## UI Constraints

- Mobile controls live in the side drawer opened by the `Menu` button.
- The main experience is intended for landscape on mobile; portrait shows the
  rotation warning.
- Story output scrolls inside the story panel. The full page must not scroll
  during normal play.
- Keep the status bar visible near the story and command input. Use it for
  errors and AI-working status.
- Tooltips should use localized `data-i18n-title` strings.

## Editing Rules

- Use `apply_patch` for manual edits.
- Keep changes small and scoped to standalone behavior.
- Do not reformat vendored/minified files such as `vendor/cytoscape-3.33.4.min.js`.
- Do not edit `my_jericho/` unless the task is explicitly about interpreter
  behavior or WASM build integration.
- Prefer existing patterns over new abstractions.
- Run `make test` before finishing changes that touch JavaScript, WASM,
  storage, translation, map, localization, or UI behavior.

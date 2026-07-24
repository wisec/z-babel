# Z-Babel Standalone Browser Plan

## Current Goal

Z-Babel Standalone is the browser-only version of the project. It loads a
Z-machine story, runs the patched Frotz/Jericho interpreter as WebAssembly, and
adds translation, speech, saves, map, and localized UI without a Python server at
runtime.

The current baseline is no longer just a spike: the MVP is usable.

## Current Status

Implemented:

- WebAssembly Frotz/Jericho build from `my_jericho`.
- Bundled default story: `stories/905.z5`.
- Local story loading with `<input type="file">`.
- Browser autosave, manual save, restore, restart, export, and import.
- Portable save format `.zbabelsave`, while still accepting old `.zaisave`.
- IndexedDB migration from old `z-ai-standalone` data to `z-babel-standalone`.
- Command history with up/down recall.
- Canonical English commands sent to the interpreter, with user-language command
  retained in history/debug.
- Status, inventory, map, and debug history panels.
- Cytoscape map with localized room names and localized edge labels.
- Map state saved/restored together with game state.
- Gemini translation with separated system/user prompts.
- Separate room-name translation prompt to avoid errors like `Fork` becoming an
  object translation instead of a location name.
- Translation caching in IndexedDB.
- Gemini STT with push-to-talk.
- Gemini TTS with audio cache.
- Status bar for errors and AI-working states, including a text spinner.
- Localized UI strings in `src/locales/{Language}.json`.
- UI language dropdown, defaulting to the target language.
- Tooltips localized through JSON.
- Light/dark/system theme selector.
- Mobile side drawer for controls.
- Portrait mobile orientation warning; mobile use is intended in landscape.

## Architecture

```text
index.html
  |
  v
src/app.js
  |-- GameSession
  |-- JerichoEngine -> build/jericho.js + build/jericho.wasm
  |-- SessionStorage -> IndexedDB
  |-- GeminiTranslator -> Gemini REST
  |-- GeminiTTS -> Gemini REST + audio cache
  |-- SpeechRecorder -> MediaRecorder/WAV
  |-- MapView -> Cytoscape
  |
  v
src/locales/{Language}.json
```

The deterministic boundary is important:

- Jericho receives canonical English commands only.
- User-language commands are displayed and stored for UI/history.
- Debug history shows `canonical (user input)`.
- Translation, speech, and localization stay outside the interpreter layer.

## Runtime Modes

English/offline:

- No Gemini key required for normal typed play.
- Story loading, interpreter, saves, map, and UI work locally.

Translated mode:

- User supplies a Gemini API key in Settings.
- The key is remembered by default in this browser unless the user disables that
  option.
- Translation/STT/TTS calls use the key directly from browser JavaScript.

Speech:

- STT requires `localhost` or HTTPS because microphone permissions are controlled
  by the browser.
- Push-to-talk uses left Shift.
- Audio is converted locally to WAV and sent to Gemini.
- STT audio is not cached.
- TTS audio may be cached in IndexedDB.

## Files

Core files:

- `index.html`: static UI shell.
- `src/app.js`: controller, event wiring, AI-working status, localization loader.
- `src/game-session.js`: command execution, transcript, map state, save records.
- `src/jericho-engine.mjs`: WASM wrapper and compatibility fallbacks for old
  `zai_*` and new `zbabel_*` bridge symbols.
- `src/translation.js`: Gemini translation/STT prompts and cache keys.
- `src/tts.js`: Gemini TTS prompts and audio cache.
- `src/speech.js`: microphone recording and WAV conversion.
- `src/map.js`: Cytoscape map rendering.
- `src/storage.js`: IndexedDB saves, translations, and audio.
- `src/locales/English.json`, `src/locales/Italian.json`: localized UI text,
  tooltips, status messages, and map labels.
- `wasm/jericho_bridge.c`: narrow C bridge exported to JavaScript.
- `Makefile`: WASM build and test commands.

Generated/local files:

- `build/jericho.js`
- `build/jericho.wasm`

Pinned dependency:

- `vendor/cytoscape-3.33.4.min.js`

## Cache And Compatibility

Translation cache keys must include:

- story id
- direction/type, for example `input`, `output`, `room`
- target language
- model
- prompt version
- source text

Compatibility decisions:

- Old `.zaisave` imports are accepted.
- New exports use `.zbabelsave`.
- Old IndexedDB data is copied into `z-babel-standalone` on first use.
- `jericho-engine.mjs` tries new `zbabel_*` WASM symbols first and old `zai_*`
  symbols as fallback.
- Browser cache busting is currently handled with query strings on modules and
  WASM assets when needed.

## Mobile UI

Current behavior:

- Desktop and wide landscape layouts use the full app.
- Small screens move the toolbar into a right-side drawer opened by `Menu`.
- Small portrait screens show a rotation warning because the map/status/story
  layout is designed for landscape.

Open questions:

- Whether portrait should eventually get a reduced single-column mode.
- Whether the debug panel should be hidden by default on mobile landscape.
- Whether the map should have a dedicated full-screen mobile view.

## Verification

Primary command from this directory:

```bash
make test
```

Current checks cover:

- WASM smoke test.
- session/map behavior.
- command aliases and command history.
- SHA/fingerprint fallback.
- translation cache/model separation.
- STT/TTS helper behavior.

Manual browser checks should cover:

- first load with default `905.z5`;
- hard refresh after cache-busted module changes;
- settings dialog and UI language switch;
- Italian translation with Gemini key;
- map labels after room movement;
- restore with map state;
- mobile landscape drawer;
- mobile portrait rotation warning.

## TODO

Near-term:

- Add browser checks for mobile drawer and portrait warning.
- Add a small locale-key check to `make test` instead of relying on manual
  `node -e` commands.
- Decide whether cache-busting should use one shared version constant instead of
  manual `?v=2` edits.
- Review status-bar behavior when multiple AI tasks overlap with TTS playback.
- Improve map layout for loops, teleports, and unusual one-way transitions.

Later:

- Evaluate local LAN AI providers through OpenAI-compatible endpoints.
- If local provider support is added, include provider and endpoint in cache
  keys.
- Consider separate provider settings for translation, STT, and TTS.
- Add PWA metadata only if installation/offline app behavior becomes a real
  requirement.

Out of scope for now:

- Shipping a developer-owned Gemini key in the static app.
- Reintroducing a Python server into the standalone runtime.
- Using Pyodide for the interpreter path.

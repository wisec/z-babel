# Z-Babel

Z-Babel is a Z-Interpreter based text adventure engine that uses AI to make classic parser-based text adventures playable
through modern language interaction.

Instead of forcing the player to guess terse English commands like `take lamp`
or `go north`, Z-Babel lets them **type** or **speak** more natural instructions
in their own language.

The AI layer translates those instructions into canonical commands for the
Z-machine interpreter, then translates the game's response back for the player.

The original game logic is not replaced by an AI storyteller. The deterministic
interpreter still runs the adventure; AI only handles the language layer around
it: translation, conversational command normalization, speech input,
text-to-speech, and localized UI.

This makes old interactive fiction more approachable for players who do not want
to fight the parser in English. They can describe intent in a more natural way,
while the game still receives the precise command form it was written for.

To make this possible, Z-Babel uses a Bring Your Own Key (BYOK) model: you need to provide your own Google Gemini API key. Google currently offers a small free usage tier, which may be enough for testing and light use.

The app is self contained: there is no server-side application and no backend account.
Story files, saves, transcripts, map state, translation cache, and generated
speech audio stay in the browser.

Try it here: [https://wisec.github.io/z-babel/](https://wisec.github.io/z-babel/)


## What It Does

- Accepts natural, conversational commands typed or spoken by the player.
- Translates those commands into English parser commands the game understands.
- Translates adventure output, room names, UI labels, tooltips, and status text.
- Supports Gemini speech-to-text for voice commands.
- Supports Gemini text-to-speech for spoken narration.
- Preserves the original parser rules by sending only normalized English
  commands to the interpreter.
- Keeps browser autosaves, manual checkpoints, portable save export/import, and
  restart.
- Tracks status, inventory, command history, interpreter debug output, and an
  explored-room map.

## Quick Start

1. Build the WebAssembly interpreter:

   ```bash
   make wasm
   ```

2. Serve this directory:

   ```bash
   ./launch.sh
   ```

   On Windows, run:

   ```bat
   launch.bat
   ```

3. Open the URL printed by the launcher. Normally it is:

   ```text
   http://127.0.0.1:8000/
   ```

Both launchers bind to `127.0.0.1` by default and automatically choose the next
free port if `8000` is already in use. Pass a bind address to expose the server
elsewhere, for example `./launch.sh 0.0.0.0` or `launch.bat 0.0.0.0`.

The bundled story loads automatically. Use **Open story** to choose another
local story file. Infocom-style interactive fiction games can be found through
[IFDB](https://ifdb.org/#games).

## Playing

**Commands**

Type/say a short parser command, a more conversational instruction, or a command in
the target language, then press **Send**. Z-Babel translates the player-facing
input into a canonical English command before it reaches the interpreter, so the
game still behaves like the original adventure.

**Controls**

Use the toolbar to save, restore, export, import, restart, open settings, or
open help. On mobile, controls live in the side menu. Mobile play is designed
for landscape orientation.

**Saves**

The browser keeps an autosave for resume and a separate manual checkpoint.
Exported `.zbabelsave` files can be imported after loading the same story file.
Older `.zaisave` imports are still accepted.

## Translation And Speech

Open **Settings**, choose a target language, and add a Gemini API key.

Italian is selected by default. The language menu also includes English plus 19
other languages.

Gemini is used for:

- translating player commands into interpreter commands;
- translating game output back to the player;
- transcribing spoken commands;
- generating spoken narration.

Typed English mode is offline and does not require an API key. Translation,
natural-language command handling, voice input, and text-to-speech require
Gemini. You can create a key in
[Google AI Studio](https://aistudio.google.com/app/apikey).

The key stays in memory session unless **Remember API key in this browser** is enabled (default).
Translations are cached in IndexedDB by story, direction, language, model, prompt
version, and source text.

For voice input, hold the **left Shift key** while speaking, or use the
**Speak/Stop** button. Recording stops automatically after 15 seconds.
Microphone access requires `localhost` or HTTPS. Recorded audio is sent for
transcription but is not stored.

## Interface Language

The UI has its own **UI language** setting. By default it follows the target
language, so choosing a language for the adventure also switches buttons,
settings, help, status messages, panel labels, and map labels.

Locale files live in `src/locales/{Language}.json`. Every language in the
target-language menu has a matching locale file.

## Privacy Model

- Story files are loaded locally in the browser.
- Saves, transcripts, map state, translations, and generated TTS audio are stored
  in browser storage.
- No application backend receives your story or save data.
- Gemini receives only the text or audio needed for enabled translation, STT, or
  TTS features.
- The Gemini API key is stored only if the user enables key remembering.

## Developer Setup

Requirements:
- Emscripten (`emcc`) 
- Make
- Node.js
- Python, only for the local launch scripts above
- Jericho/Frotz requirements are not detailed.

Build:

```bash
make wasm
```

Run tests:

```bash
make test
```

Run the Node smoke test against another story:

```bash
node test/wasm-smoke.cjs path/to/story.z5
```

The browser smoke harness is `test/wasm-smoke.html`. Serve this directory and
open that page; it reports `passed` in `data-status` after load, turn,
save/restore, and shutdown succeed.

## Technical Notes

The interpreter is built from the vendored `my_jericho/frotz` source with
Emscripten. The generated `build/jericho.js` and `build/jericho.wasm` files are
ignored by Git.

`src/jericho-engine.mjs` wraps the WebAssembly module and exposes the browser
API used by the app:

```js
import { JerichoEngine } from "./src/jericho-engine.mjs";

const engine = await JerichoEngine.create(window.createJericho, {
  locateFile: (name) => `./build/${name}`,
});
const opening = engine.load(new Uint8Array(await file.arrayBuffer()), file.name);
const turn = engine.step("look");
const location = engine.playerLocation();
const inventory = engine.inventory();
const saveBytes = engine.save();
```

The wrapper decodes Frotz output as Windows-1252, enforces Jericho's 198-byte
command limit, and returns save files as `Uint8Array` values suitable for
IndexedDB or download.

## Project Layout

- `index.html`: browser UI shell.
- `src/app.js`: main app controller and UI wiring.
- `src/game-session.js`: game state, command history, saves, and map state.
- `src/jericho-engine.mjs`: JavaScript wrapper around the WASM interpreter.
- `src/translation.js`: Gemini translation and STT prompts/calls/cache keys.
- `src/tts.js`: Gemini TTS calls and audio cache.
- `src/map.js`: Cytoscape map rendering.
- `src/storage.js`: IndexedDB persistence.
- `src/locales/`: UI locale files.
- `wasm/jericho_bridge.c`: C bridge exported to WebAssembly.
- `my_jericho/`: vendored Jericho/Frotz source.
- `stories/905.z5`: bundled default story.
- `test/`: Node and browser smoke checks.

## Compatibility

The smoke tests currently cover the bundled Z5 fixture. The compatibility matrix
has also passed Z3, Z5, and Z8 fixtures in Node.js and Chromium. Games without
Jericho object bindings can still run, but may return `null` locations or empty
object names for status/map features.

## TODO

- Improve translation quality and coverage for every supported UI language.
- Add more browser compatibility checks, especially Safari and Firefox.
- Evaluate local or self-hosted AI providers for translation, STT, and TTS.
- Add clearer release packaging for GitHub downloads or static hosting.

## Support This Project

Z-Babel is an open source project. If you find it useful, you can support its
development through [GitHub Sponsors](https://github.com/sponsors/wisec).

## License Notes

The distribution includes vendored Frotz/Jericho code. Check the
licenses in `my_jericho/` before publishing or redistributing builds, and keep
source availability obligations in mind for public releases.

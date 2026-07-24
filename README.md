# Z-Babel Standalone

Z-Babel Standalone uses AI to make classic parser-based text adventures playable
through modern language interaction. Instead of forcing the player to guess terse
English commands like `take lamp` or `go north`, it lets them **type** or **speak** more
natural instructions in their own language, translates those instructions into
canonical commands for the Z-machine interpreter, then translates the game's
response back for the player.

The goal is not to replace the original game logic with an AI storyteller. The
original deterministic interpreter still runs the adventure. AI is the language
layer around it: translation, conversational command normalization, speech input,
text-to-speech, and localized UI.

This makes old interactive fiction more approachable for players who do not want
to fight the parser in English. They can describe intent in a more natural way,
while the game still receives the precise command form it was written for.

The app is static: there is no server side application and no backend account. Story
files, saves, transcripts, map state, translation cache, and generated speech
audio stay in the browser.

## What It Does

- Lets the player type or speak natural, conversational commands in their
  language, then translates them into canonical English commands the Z-machine
  interpreter can understand.
- Translates adventure output, room names, UI labels, tooltips, and status text
  so the whole play session can happen in the target language.
- Uses Gemini speech-to-text for spoken commands.
- Uses Gemini text-to-speech for reading adventure output aloud.
- Preserves the original parser adventure rules by sending only normalized
  English commands to the interpreter.
- Keeps browser autosaves, manual checkpoints, portable save export/import, and
  restart.
- Tracks status, inventory, command history, interpreter debug output, and an
  explored-room map.

## Quick Start

Build the WebAssembly interpreter:

```bash
make wasm
```

Serve this directory:

```bash
./launch.sh
```

On Windows, run:

```bat
launch.bat
```

The launcher prints the exact URL. Normally it is:

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

Type a short parser command, a more conversational instruction, or a command in
the target language, then press **Send**. Z-Babel translates the player-facing
input into a canonical English command before it reaches the interpreter, so the
game still behaves like the original adventure.

Use the toolbar to save, restore, export, import, restart, open settings, or
open help. On mobile, controls live in the side menu. Mobile play is designed
for landscape orientation.

The browser keeps an autosave for resume and a separate manual checkpoint.
Exported `.zbabelsave` files can be imported after loading the same story file.
Older `.zaisave` imports are still accepted.

## Translation And Speech

Open **Settings**, choose a target language, and add a Gemini API key. Italian
is selected by default, and the language menu also includes English plus 19
other languages. Gemini is used for the AI language layer: translating player
commands into interpreter commands, translating game output back to the player,
transcribing spoken commands, and generating spoken narration.

Typed English mode is offline and does not require an API key but if you want translation, natural language processing,
voice input and text-to-speech Gemini will be used and it will require the API key. You can create
one in [Google AI Studio](https://aistudio.google.com/app/apikey).

The key stays in memory session unless **Remember API key in this browser** is enabled (default).
Translations are cached in IndexedDB by story, direction, language, model,
prompt version, and source text.

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

The standalone distribution includes vendored Frotz/Jericho code. Check the
licenses in `my_jericho/` before publishing or redistributing builds, and keep
source availability obligations in mind for public releases.

import { GameSession } from "./game-session.js";
import { JerichoEngine } from "./jericho-engine.mjs";
import { MapView } from "./map.js?v=2";
import { SessionStorage, decodePortableSave, encodePortableSave } from "./storage.js";
import { arrayBufferToBase64, SpeechRecorder } from "./speech.js";
import { GeminiTranslator } from "./translation.js?v=2";
import { GeminiTTS } from "./tts.js";

const DEFAULT_STORY_URL = new URL("../stories/905.z5", import.meta.url);
const MAX_RECORDING_MS = 15000;
const LANGUAGE_KEY = "zbabel-target-language";
const API_KEY_KEY = "zbabel-gemini-api-key";
const REMEMBER_KEY_KEY = "zbabel-remember-api-key";
const MODEL_KEY = "zbabel-gemini-model";
const UI_LANGUAGE_KEY = "zbabel-ui-language";
const AUTOSEND_SPEECH_KEY = "zbabel-autosend-speech";
const TTS_ENABLED_KEY = "zbabel-tts-enabled";
const THEME_KEY = "zbabel-theme";
const LEGACY_KEY_PREFIX = "zai-";
const SUPPORTED_UI_LANGUAGES = new Set([
  "English", "Italian", "French", "German", "Spanish", "Portuguese", "Dutch",
  "Polish", "Romanian", "Greek", "Russian", "Ukrainian", "Turkish", "Arabic",
  "Hebrew", "Hindi", "Bengali", "Chinese (Simplified)", "Chinese (Traditional)",
  "Japanese", "Korean",
]);
const UI_LANGUAGE_CODES = {
  English: "en",
  Italian: "it",
  French: "fr",
  German: "de",
  Spanish: "es",
  Portuguese: "pt",
  Dutch: "nl",
  Polish: "pl",
  Romanian: "ro",
  Greek: "el",
  Russian: "ru",
  Ukrainian: "uk",
  Turkish: "tr",
  Arabic: "ar",
  Hebrew: "he",
  Hindi: "hi",
  Bengali: "bn",
  "Chinese (Simplified)": "zh-Hans",
  "Chinese (Traditional)": "zh-Hant",
  Japanese: "ja",
  Korean: "ko",
};
const BROWSER_LANGUAGE_CODES = {
  ar: "Arabic",
  bn: "Bengali",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fr: "French",
  he: "Hebrew",
  hi: "Hindi",
  it: "Italian",
  iw: "Hebrew",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  tr: "Turkish",
  uk: "Ukrainian",
};
const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
const storage = new SessionStorage();
const mapView = new MapView(elements.map);
const speechRecorder = new SpeechRecorder();
let settings = loadSettings();
let engine = null;
let session = null;
let translator = createTranslator();
let tts = createTTS();
let audio = null;
let lastSpokenId = "";
let historyIndex = 0;
let draftCommand = "";
let voiceStopTimer = null;
let voiceStarting = false;
let voiceStopping = false;
let voiceHotkeyHeld = false;
let stopVoiceWhenStarted = false;
let uiText = {};
let aiWorkCount = 0;
let pendingNotice = null;
let aiMessage = "";
let aiSpinnerIndex = 0;
let aiSpinnerTimer = null;
let stableNotice = elements.notice.textContent;
const localeCache = new Map();

applyTheme(settings.theme);
elements.theme.value = settings.theme;
await loadLocale();
applyLocale();
initialize();

async function initialize() {
  try {
    engine = await JerichoEngine.create(window.createJericho, {
      locateFile: (name) => new URL(`../build/${name}?v=2`, import.meta.url).href,
    });
  } catch (error) {
    elements["story-name"].textContent = t("noStoryLoaded");
    fail(error);
    elements["story-file"].disabled = true;
    return;
  }

  try {
    const saved = await storage.latest();
    if (saved) {
      await loadStory(new Uint8Array(saved.storyBytes), saved.storyName, saved);
      return;
    }
    const response = await fetch(DEFAULT_STORY_URL);
    if (!response.ok) throw new Error(`Default story request failed: ${response.status}`);
    await loadStory(new Uint8Array(await response.arrayBuffer()), "905.z5");
  } catch (error) {
    if (!session) elements["story-name"].textContent = t("noStoryLoaded");
    fail(error);
  }
}

elements["story-file"].addEventListener("change", async () => {
  const file = elements["story-file"].files[0];
  if (!file) return;
  await run(async () => loadStory(new Uint8Array(await file.arrayBuffer()), file.name));
  elements["story-file"].value = "";
});

elements.resume.addEventListener("click", () => run(async () => {
  const record = await storage.latest();
  if (!record) throw new Error(t("noBrowserSave"));
  await loadStory(new Uint8Array(record.storyBytes), record.storyName, record);
  notice(t("resumedStory", { name: record.storyName }));
}));

elements.restart.addEventListener("click", () => {
  if (!session || !window.confirm(t("restartConfirm"))) return;
  run(async () => {
    const { storyId, storyName } = session;
    const storyBytes = session.storyBytes.slice();
    await storage.clearStory(storyId);
    await loadStory(storyBytes, storyName);
    notice(t("restarted"));
  });
});

elements["command-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  const value = elements.command.value.trim();
  if (!session || !value) return;
  elements.command.value = "";
  draftCommand = "";
  run(async () => {
    const canonical = await withAIStatus(t("aiTranslatingCommand"), () => translator.translateInput(value, session.dictionary));
    const snapshot = session.step(canonical, value);
    historyIndex = session.commandHistory.length;
    const translated = await render(snapshot);
    await storage.put(session.saveRecord("autosave"));
    elements.resume.disabled = false;
    if (translated) notice(snapshot.status.done ? t("gameEnded") : t("autosaved"));
  });
});

elements.command.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown"].includes(event.key) || !session?.commandHistory.length) return;
  event.preventDefault();
  if (event.key === "ArrowUp") {
    if (historyIndex === session.commandHistory.length) draftCommand = elements.command.value;
    historyIndex = Math.max(0, historyIndex - 1);
  } else {
    historyIndex = Math.min(session.commandHistory.length, historyIndex + 1);
  }
  elements.command.value = historyIndex === session.commandHistory.length
    ? draftCommand
    : session.commandHistory[historyIndex];
  elements.command.setSelectionRange(elements.command.value.length, elements.command.value.length);
});

elements.voice.addEventListener("click", async () => {
  if (speechRecorder.recording) {
    await stopVoiceInput();
  } else {
    await startVoiceInput("button");
  }
});

const KEYB = "ShiftLeft";
window.addEventListener("keydown", (event) => {
  if (event.code !== KEYB || event.repeat || voiceHotkeyHeld) return;
  if (elements["settings-dialog"].open || elements["help-dialog"].open || document.body.classList.contains("busy")) return;
  voiceHotkeyHeld = true;
  stopVoiceWhenStarted = false;
  event.preventDefault();
  void startVoiceInput("keyboard");
});

window.addEventListener("keyup", (event) => {
  if (event.code !== KEYB || !voiceHotkeyHeld) return;
  voiceHotkeyHeld = false;
  event.preventDefault();
  if (voiceStarting) {
    stopVoiceWhenStarted = true;
  } else {
    void stopVoiceInput();
  }
});

elements.save.addEventListener("click", () => run(async () => {
  await storage.put(session.saveRecord("manual"));
  elements.restore.disabled = false;
  notice(t("checkpointSaved"));
}));

elements.restore.addEventListener("click", () => run(async () => {
  const record = await storage.get(session.storyId, "manual");
  if (!record) throw new Error(t("noCheckpoint"));
  await render(session.restoreRecord(record));
  historyIndex = session.commandHistory.length;
  await storage.put(session.saveRecord("autosave"));
  notice(t("checkpointRestored"));
}));

elements["export-save"].addEventListener("click", () => run(async () => {
  const record = session.saveRecord("export");
  const blob = new Blob([encodePortableSave(record)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeBasename(session.storyName)}.zbabelsave`;
  link.click();
  URL.revokeObjectURL(link.href);
  notice(t("saveExported"));
}));

elements["import-save"].addEventListener("change", async () => {
  const file = elements["import-save"].files[0];
  if (!file || !session) return;
  await run(async () => {
    const record = decodePortableSave(await file.text());
    await render(session.restoreRecord(record));
    historyIndex = session.commandHistory.length;
    await storage.put(session.saveRecord("autosave"));
    notice(t("importedSaveRestored"));
  });
  elements["import-save"].value = "";
});

elements["fit-map"].addEventListener("click", () => mapView.fit());
elements["debug-panel"].addEventListener("toggle", () => {
  if (elements["debug-panel"].open) requestAnimationFrame(layoutAndScrollDebug);
});
window.addEventListener("resize", () => {
  if (elements["debug-panel"].open) requestAnimationFrame(layoutDebug);
});

elements["menu-toggle"].addEventListener("click", () => setMobileMenu(!document.body.classList.contains("menu-open")));
elements["mobile-menu-backdrop"].addEventListener("click", () => setMobileMenu(false));
elements.toolbar.addEventListener("click", (event) => {
  if (event.target.closest("button, label, select, a")) setMobileMenu(false);
});

elements.settings.addEventListener("click", openSettings);
elements.help.addEventListener("click", () => elements["help-dialog"].showModal());
elements["close-help"].addEventListener("click", () => elements["help-dialog"].close());
elements.theme.addEventListener("change", () => {
  const theme = elements.theme.value;
  settings = { ...settings, theme };
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  if (session) void render(session.snapshot());
});

function openSettings() {
  elements["target-language"].value = settings.language;
  elements["ui-language"].value = settings.uiLanguage;
  elements.model.value = settings.model;
  elements["api-key"].value = settings.apiKey;
  elements["remember-key"].checked = settings.rememberKey;
  elements["autosend-speech"].checked = settings.autosendSpeech;
  elements["tts-enabled"].checked = settings.ttsEnabled;
  elements["settings-dialog"].showModal();
}

elements["close-settings"].addEventListener("click", () => elements["settings-dialog"].close());
elements["cancel-settings"].addEventListener("click", () => elements["settings-dialog"].close());

elements["settings-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const language = elements["target-language"].value.trim() || "Italian";
    const uiLanguage = elements["ui-language"].value;
    const model = elements.model.value;
    const apiKey = elements["api-key"].value.trim();
    const autosendSpeech = elements["autosend-speech"].checked;
    const ttsEnabled = elements["tts-enabled"].checked;
    if (ttsEnabled && !apiKey) {
      throw new Error(t("apiKeyTtsRequired"));
    }
    settings = {
      ...settings, language, uiLanguage, model, apiKey, autosendSpeech, ttsEnabled, rememberKey: elements["remember-key"].checked,
    };
    localStorage.setItem(LANGUAGE_KEY, language);
    localStorage.setItem(UI_LANGUAGE_KEY, uiLanguage);
    localStorage.setItem(MODEL_KEY, model);
    localStorage.setItem(AUTOSEND_SPEECH_KEY, String(autosendSpeech));
    localStorage.setItem(TTS_ENABLED_KEY, String(ttsEnabled));
    localStorage.setItem(REMEMBER_KEY_KEY, String(settings.rememberKey));
    if (settings.rememberKey) localStorage.setItem(API_KEY_KEY, apiKey);
    else localStorage.removeItem(API_KEY_KEY);
    translator = createTranslator(session?.storyId);
    tts = createTTS(session?.storyId);
    await loadLocale();
    applyLocale();
    elements["settings-dialog"].close();
    const translated = session ? await render(session.snapshot()) : true;
    if (translated) {
      const mode = t("translationEnabled", { language });
      notice(settings.ttsEnabled ? t("ttsEnabledNotice", { mode }) : mode);
    }
  });
});

async function loadStory(bytes, name, record = null) {
  session = null;
  setSessionEnabled(false);
  elements["story-name"].textContent = t("loading", { name });
  session = await GameSession.create(engine, bytes, name);
  translator = createTranslator(session.storyId);
  tts = createTTS(session.storyId);
  lastSpokenId = "";
  if (record) session.restoreRecord(record);
  historyIndex = session.commandHistory.length;
  draftCommand = "";
  setSessionEnabled(true);
  const translated = await render(session.snapshot());
  await storage.put(session.saveRecord("autosave"));
  elements.restore.disabled = !(await storage.get(session.storyId, "manual"));
  elements.resume.disabled = false;
  elements.command.focus();
  if ((translator.enabled || settings.ttsEnabled) && !settings.apiKey) openSettings();
  if (translated) notice(record ? t("restoredStory", { name }) : t("loadedStory", { name }));
}

async function render(snapshot) {
  let view = snapshot;
  let translated = true;
  try {
    view = await translateSnapshot(snapshot);
  } catch (error) {
    translated = false;
    fail(error);
  }
  elements.story.classList.remove("empty");
  elements.story.textContent = view.history.map((item) => {
    const prefix = item.command ? `> ${item.userCommand || item.command}\n` : "";
    return `${prefix}${item.text}`;
  }).join("\n\n");
  elements.story.scrollTop = elements.story.scrollHeight;
  elements["story-name"].textContent = view.storyName;
  elements.room.textContent = view.status.room;
  elements.score.textContent = view.status.score;
  elements.moves.textContent = view.status.moves;
  renderInventory(view.inventory);
  mapView.render(view.map);
  void speakLatest(view);
  elements["fit-map"].disabled = !view.map.rooms.length;
  elements["debug-history"].textContent = snapshot.history.map((item) => {
    const original = item.userCommand && item.userCommand !== item.command ? ` (${item.userCommand})` : "";
    const prefix = item.command ? `> ${item.command}${original}\n` : "";
    return `${prefix}${item.text}`;
  }).join("\n\n");
  if (elements["debug-panel"].open) requestAnimationFrame(layoutAndScrollDebug);
  elements.command.disabled = snapshot.status.done;
  elements.send.disabled = snapshot.status.done;
  setVoiceRecording(speechRecorder.recording);
  return translated;
}

function layoutDebug() {
  const summary = elements["debug-panel"].querySelector("summary");
  elements["debug-scroll"].style.top = `${summary.offsetTop + summary.offsetHeight + 8}px`;
}

function layoutAndScrollDebug() {
  layoutDebug();
  elements["debug-scroll"].scrollTop = elements["debug-scroll"].scrollHeight;
}

async function translateSnapshot(snapshot) {
  if (translator.enabled && !settings.apiKey) return snapshot;
  if (!translator.enabled) return snapshot;
  const [history, room, inventory, rooms] = await withAIStatus(t("aiTranslatingOutput"), () => Promise.all([
    Promise.all(snapshot.history.map(async (item) => ({
      ...item,
      text: await translator.translateOutput(item.text, item.command),
    }))),
    translateRoomName(snapshot.status.room),
    Promise.all(snapshot.inventory.map((item) => translator.translateOutput(item))),
    Promise.all(snapshot.map.rooms.map(async (item) => ({
      ...item,
      name: await translateRoomName(item.name),
    }))),
  ]));
  return {
    ...snapshot,
    history,
    status: { ...snapshot.status, room },
    inventory,
    map: { ...snapshot.map, rooms },
  };
}

function renderInventory(items) {
  elements.inventory.replaceChildren();
  for (const name of items.length ? items : [t("empty")]) {
    const item = document.createElement("li");
    item.textContent = name;
    elements.inventory.append(item);
  }
}

function translateRoomName(name) {
  return translator.translateRoomName?.(name) || translator.translateOutput(name);
}

function setSessionEnabled(enabled) {
  for (const id of ["command", "send", "restart", "save", "restore", "export-save", "import-save"]) {
    elements[id].disabled = !enabled;
  }
  elements.voice.title = speechRecorder.supported ? t("startVoice") : t("voiceNotSupported");
  setVoiceRecording(speechRecorder.recording);
  elements["import-label"].classList.toggle("disabled", !enabled);
}

async function run(operation) {
  setBusy(true);
  try {
    await operation();
  } catch (error) {
    fail(error);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  document.body.classList.toggle("busy", busy);
  if (session) {
    const done = session.engine.status().done;
    elements.send.disabled = busy || done;
    setVoiceRecording(speechRecorder.recording);
  }
}

function setMobileMenu(open) {
  document.body.classList.toggle("menu-open", open);
  elements["menu-toggle"].setAttribute("aria-expanded", String(open));
  elements["mobile-menu-backdrop"].hidden = !open;
}

async function startVoiceInput(trigger) {
  if (!session || voiceStarting || voiceStopping) return;
  if (session.engine.status().done) return;
  if (!settings.apiKey) {
    fail(new Error(t("voiceNeedKey")));
    openSettings();
    return;
  }

  voiceStarting = true;
  elements.voice.disabled = true;
  try {
    await speechRecorder.start();
    setVoiceRecording(true);
    notice(trigger === "keyboard"
      ? t("listenKeyboard")
      : t("listenButton"));
    voiceStopTimer = window.setTimeout(stopVoiceInput, MAX_RECORDING_MS);
  } catch (error) {
    fail(error);
  } finally {
    voiceStarting = false;
    setVoiceRecording(speechRecorder.recording);
  }
  if (stopVoiceWhenStarted && speechRecorder.recording) await stopVoiceInput();
}

async function stopVoiceInput() {
  if (!speechRecorder.recording || voiceStopping) return;
  voiceStopping = true;
  window.clearTimeout(voiceStopTimer);
  voiceStopTimer = null;
  elements.voice.disabled = true;
  elements.voice.textContent = t("wait");
  notice(t("transcribing"));
  try {
    const wav = await speechRecorder.stop();
    const transcript = await withAIStatus(t("aiTranscribing"), () => translator.transcribeAudio(arrayBufferToBase64(wav)));
    elements.command.value = transcript;
    draftCommand = transcript;
    elements.command.focus();
    elements.command.setSelectionRange(transcript.length, transcript.length);
    if (settings.autosendSpeech) {
      notice(t("voiceSend"));
      elements["command-form"].requestSubmit();
    } else {
      notice(t("voiceReady"));
    }
  } catch (error) {
    fail(error);
  } finally {
    voiceStopping = false;
    stopVoiceWhenStarted = false;
    setVoiceRecording(false);
  }
}

function setVoiceRecording(recording) {
  const done = session?.engine.status().done || false;
  const busy = document.body.classList.contains("busy");
  elements.voice.classList.toggle("recording", recording);
  elements.voice.textContent = recording ? t("stop") : t("speak");
  elements.voice.setAttribute("aria-pressed", String(recording));
  elements.voice.title = recording ? t("stopVoice") : t("voiceTitle");
  elements.voice.disabled = !session
    || voiceStarting
    || voiceStopping
    || !speechRecorder.supported
    || (!recording && (busy || done));
}

async function speakLatest(view) {
  if (!settings.ttsEnabled || !settings.apiKey) return;
  const item = view.history.at(-1);
  if (!item?.text) return;
  const spokenId = JSON.stringify([
    session?.storyId || "", view.status.moves, item.command || "", item.text,
  ]);
  if (spokenId === lastSpokenId) return;
  lastSpokenId = spokenId;

  try {
    const wav = await withAIStatus(t("aiSpeaking"), () => tts.synthesize(item.text));
    if (!wav) return;
    if (audio) {
      audio.pause();
      URL.revokeObjectURL(audio.src);
    }
    audio = new Audio(URL.createObjectURL(base64ToBlob(wav, "audio/wav")));
    await audio.play();
  } catch (error) {
    fail(error);
  }
}

function notice(message, error = false) {
  if (aiWorkCount && !error) {
    pendingNotice = { message, error };
    return;
  }
  setNotice(message, error);
}

function setNotice(message, error = false) {
  stopAISpinner();
  stableNotice = message;
  elements.notice.textContent = message;
  elements.notice.classList.toggle("error", error);
  elements.notice.classList.toggle("working", false);
}

function fail(error) {
  console.error(error);
  notice(error?.message || String(error), true);
}

async function withAIStatus(message, operation) {
  aiWorking(message);
  try {
    return await operation();
  } finally {
    aiDone();
  }
}

function aiWorking(message) {
  aiWorkCount += 1;
  pendingNotice = null;
  aiMessage = message;
  startAISpinner();
  elements.notice.classList.remove("error");
  elements.notice.classList.add("working");
}

function aiDone() {
  aiWorkCount = Math.max(0, aiWorkCount - 1);
  if (!aiWorkCount) {
    stopAISpinner();
    elements.notice.classList.remove("working");
    if (pendingNotice) {
      const { message, error } = pendingNotice;
      pendingNotice = null;
      setNotice(message, error);
    } else {
      setNotice(stableNotice);
    }
  }
}

function startAISpinner() {
  renderAISpinner();
  if (aiSpinnerTimer) return;
  aiSpinnerTimer = window.setInterval(renderAISpinner, 120);
}

function stopAISpinner() {
  if (!aiSpinnerTimer) return;
  window.clearInterval(aiSpinnerTimer);
  aiSpinnerTimer = null;
}

function renderAISpinner() {
  const frames = ["|", "/", "-", "\\"];
  elements.notice.textContent = `${frames[aiSpinnerIndex]} ${aiMessage}`;
  aiSpinnerIndex = (aiSpinnerIndex + 1) % frames.length;
}

function safeBasename(filename) {
  return filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "game";
}

function loadSettings() {
  const apiKey = setting(API_KEY_KEY) || "";
  const rememberKey = setting(REMEMBER_KEY_KEY);
  return {
    language: setting(LANGUAGE_KEY) || browserLanguage(),
    uiLanguage: setting(UI_LANGUAGE_KEY) || "target",
    model: setting(MODEL_KEY) || "gemini-3.5-flash-lite",
    theme: setting(THEME_KEY) || "system",
    autosendSpeech: setting(AUTOSEND_SPEECH_KEY) === "true",
    ttsEnabled: setting(TTS_ENABLED_KEY) === "true",
    apiKey,
    rememberKey: rememberKey == null ? true : rememberKey === "true",
  };
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const tag = String(language || "").toLowerCase();
    if (tag.startsWith("zh")) {
      return /(?:hant|tw|hk|mo)/.test(tag) ? "Chinese (Traditional)" : "Chinese (Simplified)";
    }
    const match = BROWSER_LANGUAGE_CODES[tag.split("-")[0]];
    if (match) return match;
  }
  return "English";
}

function setting(key) {
  return localStorage.getItem(key) || localStorage.getItem(key.replace("zbabel-", LEGACY_KEY_PREFIX));
}

async function loadLocale() {
  const language = uiLanguage();
  const fallback = await fetchLocale("English");
  const selected = language === "English" ? {} : await fetchLocale(language);
  uiText = { ...fallback, ...selected };
}

async function fetchLocale(language) {
  if (localeCache.has(language)) return localeCache.get(language);
  const response = await fetch(new URL(`./locales/${language}.json`, import.meta.url));
  if (!response.ok) throw new Error(`Locale ${language} could not be loaded.`);
  const data = await response.json();
  localeCache.set(language, data);
  return data;
}

function applyLocale() {
  const language = uiLanguage();
  document.documentElement.lang = UI_LANGUAGE_CODES[language] || "en";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }
  for (const node of document.querySelectorAll("[data-i18n-title]")) {
    node.title = t(node.dataset.i18nTitle);
  }
  elements.theme.setAttribute("aria-label", t("theme"));
  elements["close-settings"].setAttribute("aria-label", t("close"));
  elements["close-help"].setAttribute("aria-label", t("close"));
  mapView.setEmptyText?.(t("noRooms"));
  mapView.setDirectionLabels?.(mapDirectionLabels());
  mapView.setCommandLabels?.(mapCommandLabels());
  setVoiceRecording(speechRecorder.recording);
  if (!aiWorkCount) stableNotice = elements.notice.textContent;
  if (!session && elements.story.classList.contains("empty")) {
    elements.story.textContent = t("openStoryPrompt");
  }
}

function t(key, values = {}) {
  const template = uiText[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function mapDirectionLabels() {
  return {
    north: t("mapDirNorth"),
    south: t("mapDirSouth"),
    east: t("mapDirEast"),
    west: t("mapDirWest"),
    northeast: t("mapDirNortheast"),
    northwest: t("mapDirNorthwest"),
    southeast: t("mapDirSoutheast"),
    southwest: t("mapDirSouthwest"),
    up: t("mapDirUp"),
    down: t("mapDirDown"),
    enter: t("mapDirEnter"),
    exit: t("mapDirExit"),
    in: t("mapDirIn"),
    out: t("mapDirOut"),
  };
}

function mapCommandLabels() {
  return {
    look: t("mapCommandLook"),
    l: t("mapCommandLook"),
    wait: t("mapCommandWait"),
    z: t("mapCommandWait"),
    search: t("mapCommandSearch"),
    climb: t("mapCommandClimb"),
  };
}

function uiLanguage() {
  const language = settings.uiLanguage === "target" ? settings.language : settings.uiLanguage;
  return SUPPORTED_UI_LANGUAGES.has(language) ? language : "English";
}

function createTranslator(storyId = "") {
  return new GeminiTranslator({ ...settings, storyId, cache: storage });
}

function createTTS(storyId = "") {
  return new GeminiTTS({
    apiKey: settings.apiKey,
    language: settings.language,
    storyId,
    cache: storage,
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = ["light", "dark", "system"].includes(theme) ? theme : "system";
}

function base64ToBlob(value, type) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

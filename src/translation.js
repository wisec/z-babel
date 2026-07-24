export const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
export const GEMINI_MODEL = GEMINI_MODELS[0];
const PROMPT_VERSION = "python-prompts-v1";

export class GeminiTranslator {
  constructor({ apiKey = "", language = "English", model = GEMINI_MODEL, storyId = "", cache, fetchImpl = fetch } = {}) {
    this.apiKey = apiKey.trim();
    this.language = language.trim() || "English";
    this.model = model.trim() || GEMINI_MODEL;
    this.storyId = storyId;
    this.cache = cache;
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.pending = new Map();
  }

  get enabled() {
    return this.language.toLowerCase() !== "english";
  }

  async translateInput(text, dictionary) {
    if (!this.enabled) return text.trim();
    this.#requireKey();
    const translated = await this.#translate(
      "input",
      inputSystemPrompt(dictionary, this.language),
      text,
      text,
    );
    const command = translated.replace(/^```(?:text)?\s*|\s*```$/gi, "").trim().split(/\r?\n/)[0].trim();
    if (!command || command.toLowerCase() === "antani") {
      throw new Error("The command could not be translated into valid game terms.");
    }
    if (!commandUsesDictionary(command, dictionary)) {
      throw new Error(`Gemini returned a command outside the game dictionary: ${command}`);
    }
    return command;
  }

  async translateOutput(text, command = "") {
    if (!text || !this.enabled) return text;
    this.#requireKey();
    const prompt = command ? `Command: ${command}\nText: ${text}\n` : text;
    return this.#translate("output", outputSystemPrompt(this.language), prompt, prompt);
  }

  async translateRoomName(text) {
    if (!text || !this.enabled) return text;
    this.#requireKey();
    return this.#translate("room", roomNameSystemPrompt(this.language), text, text);
  }

  async transcribeAudio(data, mimeType = "audio/wav") {
    this.#requireKey();
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: speechSystemPrompt(this.language) }] },
          contents: [{
            role: "user",
            parts: [
              { text: "Transcribe the attached player command." },
              { inline_data: { mime_type: mimeType, data } },
            ],
          }],
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Gemini request failed (${response.status}).`);
    const transcript = responseText(body);
    if (!transcript) throw new Error("Gemini returned no speech transcript.");
    return transcript.replace(/^```(?:text)?\s*|\s*```$/gi, "").trim();
  }

  async #translate(direction, systemPrompt, userPrompt, source) {
    const cacheId = JSON.stringify([
      this.storyId, direction, this.language.toLowerCase(), this.model, PROMPT_VERSION, source,
    ]);
    const cached = await this.cache?.getTranslation(cacheId);
    if (cached) return cached;
    if (this.pending.has(cacheId)) return this.pending.get(cacheId);

    const request = (async () => {
      const response = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status}).`);
      const translated = responseText(data);
      if (!translated) throw new Error("Gemini returned no translation.");
      await this.cache?.putTranslation(cacheId, translated);
      return translated;
    })();
    this.pending.set(cacheId, request);
    try {
      return await request;
    } finally {
      this.pending.delete(cacheId);
    }
  }

  #requireKey() {
    if (!this.apiKey) throw new Error("Add a Gemini API key in Settings before using translation.");
  }
}

export function inputSystemPrompt(dictionary, language) {
  return `You are an expert translator from the player's language to English and an expert in Infocom text adventures.
The player's language is ${language}.
Translate every player phrase into a command the Z-machine interpreter can understand.
Be concise. Return only the translation and nothing else.
Always use the full command word, not minimal aliases such as X for EXAMINE.
Keep lower case unless upper case is necessary.
Expect short direction commands and translate them to English cardinal directions: E, W, N, S, NW, SE, etc.
The adventure understands a limited dictionary, so command translation must be strict.
This is the dictionary of words the system understands:
[${dictionary.join(", ")}]
If the input means "reload", "recover", or similar, answer "restore".
If the input cannot be translated into valid game-command terms, answer "antani".`;
}

export function commandUsesDictionary(command, dictionary) {
  if (!dictionary.length) return true;
  const known = new Set(dictionary.map((word) => word.toLowerCase()));
  const words = command.toLowerCase().match(/[a-z0-9$#'-]+/g) || [];
  return Boolean(words.length) && words.every((word) => known.has(word)
    || [...known].some((entry) => entry.length >= 6 && word.startsWith(entry)));
}

export function outputSystemPrompt(language) {
  const base = `You are an expert English-to-${language} translator for Infocom interactive fiction. Preserve the tone of the original.
Translate into ${language}. Be precise, but keep a narrative and detailed style. Do not omit any part of the source text.
Preserve punctuation and text structure where possible, because they may contain important nuance for the reader.
Speak directly to the reader.
Do not explain the translation. Return only the translation, and translate only the Text field without adding the command.`;
  if (language.toLowerCase() !== "italian") return base;
  return `${base}
Example:
Input: Terminal Room
This is a large room crammed with computer terminals, small computers, and printers. An exit leads south. Banners, posters, and signs festoon the walls. Most of the tables are covered with waste paper, old pizza boxes, and empty Coke cans. There are usually a lot of people here, but tonight it's almost deserted.
Output: Sala Terminali
Questa è una vasta sala piena di terminali, computer e stampanti.
Un'uscita conduce a sud.
I muri sono ricoperti di striscioni e poster.
Gran parte dei tavoli sono ricoperti da rifiuti, scatole di pizza e lattine di Coca-Cola.
Di solito c'è parecchia gente, ma stasera è quasi deserta.

Example 2: when an action is available, it is provided to give more context to the translation:
Input:
Command: ask
Text: (yourself for the brass key)
You are carrying:
a brass key

Translate considering that the verb was ask:
(a te stesso la chiave di ottone)
Porti con te:
una chiave di ottone.`;
}

export function roomNameSystemPrompt(language) {
  const base = `You are translating Z-machine interactive fiction location names from English to ${language}.
The text is always a room name, location title, map node label, or status-bar location.
Translate it as a place name in an adventure map, not as an everyday object unless the wording clearly requires that.
Keep it short and natural for a map/status UI.
Do not explain the translation. Return only the translated location name.`;
  if (language.toLowerCase() !== "italian") return base;
  return `${base}
Examples:
Fork -> Bivio
Clearing -> Radura
Landing -> Pianerottolo
Gallery -> Galleria`;
}

export function speechSystemPrompt(language) {
  return `You transcribe short spoken commands for an Infocom text adventure.
The spoken language is ${language}.
Return only the exact transcript in ${language}, with no translation, explanation, punctuation, or quotation marks.
Keep the command concise and on one line.`;
}

function responseText(data) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "").join("").trim() || "";
}

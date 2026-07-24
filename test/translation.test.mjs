import assert from "node:assert/strict";
import {
  GEMINI_MODEL, GeminiTranslator, commandUsesDictionary, inputSystemPrompt, objectNameSystemPrompt, outputSystemPrompt, roomNameSystemPrompt,
} from "../src/translation.js";

const values = new Map();
const cache = {
  getTranslation: async (key) => values.get(key) || null,
  putTranslation: async (key, value) => values.set(key, value),
};
let calls = 0;
let request;
const fetchImpl = async (url, options) => {
  calls += 1;
  request = { url, options, body: JSON.parse(options.body) };
  const system = request.body.system_instruction.parts[0].text;
  const user = request.body.contents[0].parts[0].text;
  const text = system.includes("inventory object") && user === "brass key"
    ? "chiave di ottone"
    : system.includes("location names") && user === "Fork" ? "Bivio" : "guarda";
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: system.includes("player's language") ? " look " : ` ${text} ` }] } }],
    }),
  };
};

const translator = new GeminiTranslator({
  apiKey: "secret", language: "Italian", storyId: "story", cache, fetchImpl,
});
assert.equal(await translator.translateOutput("look", "examine"), "guarda");
assert.equal(await translator.translateOutput("look", "examine"), "guarda");
assert.equal(calls, 1, "the second identical translation should use the cache");
assert.equal(request.url.includes(GEMINI_MODEL), true);
assert.equal(request.options.headers["x-goog-api-key"], "secret");
assert.equal(request.body.contents[0].role, "user");
assert.equal(request.body.generationConfig.temperature, 0);
assert.match(request.body.system_instruction.parts[0].text, /English-to-Italian/);
assert.match(inputSystemPrompt(["look", "north"], "Italian"), /\[look, north\]/);
assert.match(outputSystemPrompt("Italian"), /Preserve the tone/);
assert.doesNotMatch(outputSystemPrompt("Italian"), /Markdown formatting/);
assert.match(outputSystemPrompt("Italian", true), /Rooms\/Locations/);
assert.match(outputSystemPrompt("Italian", true), /No added text, just the translation/);
assert.match(roomNameSystemPrompt("Italian"), /location names/);
assert.match(objectNameSystemPrompt("Italian"), /inventory object/);
assert.equal(await translator.translateRoomName("Fork"), "Bivio");
assert.equal(await translator.translateRoomName("Fork"), "Bivio");
assert.equal(calls, 2, "room names should use their own cached translation");
assert.equal(await translator.translateInput("guarda", ["look"]), "look");
assert.equal(commandUsesDictionary("examine lamp", ["examin", "lamp"]), true);
assert.equal(commandUsesDictionary("dance", ["look"]), false);
assert.equal(await translator.transcribeAudio("UklGRg=="), "guarda");
assert.equal(request.body.generationConfig.temperature, 0);
assert.equal(request.body.contents[0].parts[1].inline_data.mime_type, "audio/wav");
assert.equal(request.body.contents[0].parts[1].inline_data.data, "UklGRg==");

const offline = new GeminiTranslator({ language: "English", cache, fetchImpl });
assert.equal(await offline.translateInput("north", []), "north");
assert.equal(calls, 4, "English command input should not call Gemini");

const alternative = new GeminiTranslator({
  apiKey: "secret", language: "Italian", model: "gemini-3.5-flash", storyId: "story", cache, fetchImpl,
});
assert.equal(await alternative.translateOutput("look", "examine"), "guarda");
assert.match(request.url, /models\/gemini-3\.5-flash:generateContent$/);
assert.equal(calls, 5, "the model must be part of the translation cache key");

const markdown = new GeminiTranslator({
  apiKey: "secret", language: "Italian", storyId: "story", cache, markdownOutput: true, fetchImpl,
});
assert.equal(await markdown.translateOutput("look", "examine"), "guarda");
assert.match(request.body.system_instruction.parts[0].text, /Directions & Objects/);
assert.equal(calls, 6, "markdown output must use a separate prompt cache version");
assert.equal(await markdown.translateOutput("brass key", "", { markdownOutput: false }), "guarda");
assert.doesNotMatch(request.body.system_instruction.parts[0].text, /Directions & Objects/);
assert.equal(calls, 7, "plain output can be requested from a markdown-enabled translator");
assert.equal(await markdown.translateObjectName("brass key"), "chiave di ottone");
assert.match(request.body.system_instruction.parts[0].text, /inventory object/);
assert.doesNotMatch(request.body.system_instruction.parts[0].text, /Directions & Objects/);
assert.equal(calls, 8, "inventory object names use their own short prompt");

console.log("translation tests passed");

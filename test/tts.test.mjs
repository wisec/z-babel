import assert from "node:assert/strict";
import { GeminiTTS, pcmBase64ToWavBase64, ttsPrompt } from "../src/tts.js";

const pcm = Buffer.from([0, 0, 255, 127]).toString("base64");
const wav = Buffer.from(pcmBase64ToWavBase64(pcm), "base64");
assert.equal(wav.toString("ascii", 0, 4), "RIFF");
assert.equal(wav.toString("ascii", 8, 12), "WAVE");
assert.equal(wav.readUInt32LE(24), 24000);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal(wav.readUInt16LE(34), 16);
assert.equal(wav.length, 48);
assert.match(ttsPrompt("Italian", "Sei in una stanza buia."), /LANGUAGE:\nItalian/);
assert.match(ttsPrompt("Italian", "Sei in una stanza buia."), /Read only the transcript/);

const values = new Map();
const cache = {
  getAudio: async (key) => values.get(key) || null,
  putAudio: async (key, value) => values.set(key, value),
};
let calls = 0;
let request;
const fetchImpl = async (url, options) => {
  calls += 1;
  request = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { data: pcm } }] } }],
    }),
  };
};

const tts = new GeminiTTS({
  apiKey: "secret", language: "Italian", storyId: "story", cache, fetchImpl,
});
assert.equal(await tts.synthesize("Sei in una stanza buia."), pcmBase64ToWavBase64(pcm));
assert.equal(await tts.synthesize("Sei in una stanza buia."), pcmBase64ToWavBase64(pcm));
assert.equal(calls, 1, "the second identical TTS request should use the audio cache");
assert.match(request.url, /models\/gemini-3\.1-flash-tts-preview:generateContent$/);
assert.equal(request.options.headers["x-goog-api-key"], "secret");
assert.deepEqual(request.body.generationConfig.responseModalities, ["AUDIO"]);
assert.equal(
  request.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
  "Charon",
);

console.log("tts tests passed");

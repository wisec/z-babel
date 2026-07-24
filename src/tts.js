export const TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const TTS_VOICE = "Charon";
const TTS_PROMPT_VERSION = "adventure-narrator-v1";
const PCM_RATE = 24000;
const PCM_CHANNELS = 1;
const PCM_SAMPLE_WIDTH = 2;

export class GeminiTTS {
  constructor({
    apiKey = "", language = "English", model = TTS_MODEL, voice = TTS_VOICE,
    storyId = "", cache, fetchImpl = fetch,
  } = {}) {
    this.apiKey = apiKey.trim();
    this.language = language.trim() || "English";
    this.model = model;
    this.voice = voice;
    this.storyId = storyId;
    this.cache = cache;
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.pending = new Map();
  }

  async synthesize(text) {
    const transcript = text.trim();
    if (!transcript) return null;
    this.#requireKey();
    const cacheId = JSON.stringify([
      this.storyId, this.language.toLowerCase(), this.model, this.voice, TTS_PROMPT_VERSION, transcript,
    ]);
    const cached = await this.cache?.getAudio(cacheId);
    if (cached) return cached;
    if (this.pending.has(cacheId)) return this.pending.get(cacheId);

    const request = (async () => {
      const response = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: ttsPrompt(this.language, transcript) }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: this.voice },
                },
              },
            },
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Gemini TTS request failed (${response.status}).`);
      const pcm = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!pcm) throw new Error("Gemini returned no TTS audio.");
      const wav = pcmBase64ToWavBase64(pcm);
      await this.cache?.putAudio(cacheId, wav);
      return wav;
    })();

    this.pending.set(cacheId, request);
    try {
      return await request;
    } finally {
      this.pending.delete(cacheId);
    }
  }

  #requireKey() {
    if (!this.apiKey) throw new Error("Add a Gemini API key in Settings before using text to speech.");
  }
}

export function ttsPrompt(language, transcript) {
  return `Synthesize expressive narration for an interactive fiction text adventure.

LANGUAGE:
${language}

VOICE PERFORMANCE:
Act as a skilled audiobook narrator for classic text adventures.
Use an evocative, theatrical, but restrained delivery.
Keep the voice intimate and clear, as if guiding one player through a mysterious world.
Use natural pauses after room titles, sentence endings, and important discoveries.
Slightly increase tension for danger, darkness, uncertainty, locked doors, strange objects, or failed actions.
Use quiet curiosity for descriptions and visible objects.
Use a firmer, matter-of-fact tone for inventory, status, and parser feedback.
Do not exaggerate, do not sound like a cartoon, and do not add comedy unless the text itself is comic.

STRICT READING RULES:
Read only the transcript.
Do not translate, summarize, explain, correct, expand, or add anything.
Do not read these labels aloud: ROOM, TRANSCRIPT, STYLE, INSTRUCTIONS.
Preserve the meaning, order, punctuation, and line breaks of the transcript.
Do not reveal hidden information or imply facts not present in the text.

TRANSCRIPT:
"""
${transcript}
"""`;
}

export function pcmBase64ToWavBase64(pcmBase64) {
  const pcm = base64ToBytes(pcmBase64);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, PCM_RATE, true);
  view.setUint32(28, PCM_RATE * PCM_CHANNELS * PCM_SAMPLE_WIDTH, true);
  view.setUint16(32, PCM_CHANNELS * PCM_SAMPLE_WIDTH, true);
  view.setUint16(34, PCM_SAMPLE_WIDTH * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.byteLength, true);

  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return bytesToBase64(wav);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

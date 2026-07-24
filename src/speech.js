const RECORDER_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export class SpeechRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
  }

  get supported() {
    return Boolean(globalThis.MediaRecorder && globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  get recording() {
    return this.mediaRecorder?.state === "recording";
  }

  async start() {
    if (!this.supported) throw new Error("Voice input is not supported by this browser.");
    if (this.recording) throw new Error("Voice recording is already active.");

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.chunks = [];
    const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) this.chunks.push(event.data);
    });
    this.mediaRecorder.start();
  }

  async stop() {
    if (!this.recording) throw new Error("Voice recording is not active.");
    const recorder = this.mediaRecorder;
    return new Promise((resolve, reject) => {
      recorder.addEventListener("error", (event) => reject(event.error), { once: true });
      recorder.addEventListener("stop", async () => {
        this.#releaseStream();
        try {
          const recording = new Blob(this.chunks, { type: recorder.mimeType });
          if (!recording.size) throw new Error("The microphone recording was empty.");
          resolve(await recordingToWav(recording));
        } catch (error) {
          reject(error);
        } finally {
          this.mediaRecorder = null;
          this.chunks = [];
        }
      }, { once: true });
      recorder.stop();
    });
  }

  #releaseStream() {
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
  }
}

export async function recordingToWav(recording) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Audio conversion is not supported by this browser.");
  const context = new AudioContextClass();
  try {
    const audio = await context.decodeAudioData(await recording.arrayBuffer());
    return encodeWav(audio);
  } finally {
    await context.close();
  }
}

export function encodeWav(audio) {
  const samples = new Int16Array(audio.length);
  const channels = Array.from(
    { length: audio.numberOfChannels },
    (_, index) => audio.getChannelData(index),
  );
  for (let frame = 0; frame < audio.length; frame += 1) {
    let sample = 0;
    for (const channel of channels) sample += channel[frame];
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    samples[frame] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + samples.byteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.byteLength, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + (index * 2), samples[index], true);
  }
  return buffer;
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

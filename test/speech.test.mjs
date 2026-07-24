import assert from "node:assert/strict";
import { arrayBufferToBase64, encodeWav } from "../src/speech.js";

const left = new Float32Array([-1, 0.5, 1]);
const right = new Float32Array([-1, -0.5, 1]);
const wav = encodeWav({
  length: 3,
  numberOfChannels: 2,
  sampleRate: 48000,
  getChannelData: (index) => [left, right][index],
});
const view = new DataView(wav);
const ascii = (offset, length) => String.fromCharCode(
  ...new Uint8Array(wav, offset, length),
);

assert.equal(wav.byteLength, 50);
assert.equal(ascii(0, 4), "RIFF");
assert.equal(ascii(8, 4), "WAVE");
assert.equal(ascii(36, 4), "data");
assert.equal(view.getUint32(24, true), 48000);
assert.equal(view.getUint16(22, true), 1);
assert.equal(view.getInt16(44, true), -32768);
assert.equal(view.getInt16(46, true), 0);
assert.equal(view.getInt16(48, true), 32767);
assert.equal(Buffer.from(arrayBufferToBase64(wav), "base64").byteLength, wav.byteLength);

console.log("speech tests passed");

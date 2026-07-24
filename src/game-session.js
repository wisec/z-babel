const DIRECTIONS = {
  n: "north", north: "north", s: "south", south: "south",
  e: "east", east: "east", w: "west", west: "west",
  ne: "northeast", northeast: "northeast",
  nw: "northwest", northwest: "northwest",
  se: "southeast", southeast: "southeast",
  sw: "southwest", southwest: "southwest",
  u: "up", up: "up", d: "down", down: "down",
  stand: "up", "stand up": "up",
  enter: "enter", exit: "exit", in: "in", out: "out",
};

const DELTAS = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  northeast: [1, -1], northwest: [-1, -1],
  southeast: [1, 1], southwest: [-1, 1],
  up: [0, -1], down: [0, 1], enter: [1, 0], exit: [-1, 0],
  in: [1, 0], out: [-1, 0],
};

export function directionFromCommand(command) {
  const normalized = command.trim().toLowerCase();
  const words = normalized.split(/\s+/);
  if (!words[0]) return null;
  if (["go", "move", "walk"].includes(words[0]) && words[1]) {
    return DIRECTIONS[words[1]] || null;
  }
  return DIRECTIONS[normalized] || DIRECTIONS[words[0]] || null;
}

export function cleanObservation(text) {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

export class GameSession {
  static async create(engine, storyBytes, storyName) {
    const storyId = await storyFingerprint(storyBytes);
    const opening = cleanObservation(engine.load(storyBytes, storyName));
    const session = new GameSession(engine, storyId, storyName, storyBytes);
    session.dictionary = engine.dictionary?.() || [];
    session.history.push({ command: "", userCommand: "", text: opening });
    session.#rememberRoom(engine.playerLocation());
    return session;
  }

  constructor(engine, storyId, storyName, storyBytes) {
    this.engine = engine;
    this.storyId = storyId;
    this.storyName = storyName;
    this.storyBytes = storyBytes.slice();
    this.history = [];
    this.commandHistory = [];
    this.dictionary = [];
    this.rooms = {};
    this.coords = {};
    this.edges = [];
  }

  step(command, userCommand = command) {
    const value = command.trim();
    const before = this.engine.playerLocation();
    const turn = this.engine.step(value);
    const after = this.engine.playerLocation();
    this.commandHistory.push(userCommand);
    this.history.push({ command: value, userCommand, text: cleanObservation(turn.observation) });
    this.#rememberMovement(before, after, value, userCommand);
    return this.snapshot();
  }

  snapshot() {
    const status = this.engine.status();
    const location = this.engine.playerLocation();
    return {
      storyId: this.storyId,
      storyName: this.storyName,
      history: this.history,
      commandHistory: this.commandHistory,
      status: { ...status, room: location?.name || "Unknown" },
      inventory: this.engine.inventory().map((item) => item.name).filter(Boolean),
      map: {
        current: location ? String(location.number) : null,
        rooms: Object.values(this.rooms),
        edges: this.edges,
      },
    };
  }

  saveRecord(slot = "autosave") {
    return {
      id: `${this.storyId}:${slot}`,
      slot,
      storyId: this.storyId,
      storyName: this.storyName,
      storyBytes: this.storyBytes.slice(),
      saveBytes: this.engine.save(),
      savedAt: Date.now(),
      state: {
        history: structuredClone(this.history),
        commandHistory: [...this.commandHistory],
        rooms: structuredClone(this.rooms),
        coords: structuredClone(this.coords),
        edges: structuredClone(this.edges),
      },
    };
  }

  restoreRecord(record) {
    if (record.storyId !== this.storyId) throw new Error("This save belongs to another story file.");
    this.engine.restore(record.saveBytes);
    this.history = structuredClone(record.state.history || []);
    this.commandHistory = [...(record.state.commandHistory || [])];
    this.rooms = structuredClone(record.state.rooms || {});
    this.coords = structuredClone(record.state.coords || {});
    this.edges = structuredClone(record.state.edges || []);
    this.#rememberRoom(this.engine.playerLocation());
    return this.snapshot();
  }

  #rememberMovement(before, after, command, userCommand = command) {
    this.#rememberRoom(before);
    if (!before || !after || before.number === after.number) {
      this.#rememberRoom(after);
      return;
    }

    const knownDirection = directionFromCommand(command);
    const direction = knownDirection || "transition";
    const from = String(before.number);
    const to = String(after.number);
    const [x, y] = this.coords[from] || [0, 0];
    const [dx, dy] = DELTAS[direction] || [1, 1];
    if (!this.rooms[to]) this.coords[to] = this.#nextFreeCoord(to, [x + dx, y + dy], direction);
    this.#rememberRoom(after);
    const edge = { from, to, direction };
    if (!knownDirection) {
      edge.command = command.trim().toLowerCase();
      edge.userCommand = userCommand.trim().toLowerCase();
    }
    if (!this.edges.some((item) => item.from === from && item.to === to && item.direction === direction)) {
      this.edges.push(edge);
    }
  }

  #rememberRoom(location) {
    if (!location) return;
    const id = String(location.number);
    this.coords[id] ||= [0, 0];
    this.rooms[id] = {
      id,
      name: location.name || `Room ${id}`,
      x: this.coords[id][0],
      y: this.coords[id][1],
    };
  }

  #nextFreeCoord(roomId, desired, direction) {
    const occupied = new Set(Object.entries(this.coords)
      .filter(([id]) => id !== roomId)
      .map(([, coord]) => coord.join(",")));
    if (!occupied.has(desired.join(","))) return desired;

    const [x, y] = desired;
    const horizontal = ["east", "west", "enter", "exit", "in", "out"].includes(direction);
    const vertical = ["north", "south", "up", "down"].includes(direction);
    for (let offset = 1; offset <= occupied.size + 1; offset += 1) {
      const candidates = horizontal
        ? [[x, y - offset], [x, y + offset]]
        : vertical
          ? [[x - offset, y], [x + offset, y]]
          : [[x - offset, y], [x + offset, y], [x, y - offset], [x, y + offset]];
      const free = candidates.find((coord) => !occupied.has(coord.join(",")));
      if (free) return free;
    }
    return desired;
  }
}

export async function storyFingerprint(bytes, subtle = globalThis.crypto?.subtle) {
  if (subtle) {
    try {
      const digest = await subtle.digest("SHA-256", bytes);
      return toHex(new Uint8Array(digest));
    } catch {
      // Some non-secure browser contexts expose crypto without a usable digest.
    }
  }
  return sha256(bytes);
}

function sha256(bytes) {
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const previous = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      [a, b, c, d, e, f, g, h] = [(temp1 + temp2) >>> 0, a, b, c, (d + temp1) >>> 0, e, f, g];
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

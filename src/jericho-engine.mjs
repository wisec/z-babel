const MAX_COMMAND_BYTES = 198;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("windows-1252");

export class JerichoEngine {
  static async create(moduleFactory, moduleOptions = {}) {
    if (typeof moduleFactory !== "function") {
      throw new TypeError("A createJericho module factory is required.");
    }
    return new JerichoEngine(await moduleFactory(moduleOptions));
  }

  constructor(module) {
    this.module = module;
    this.storyPath = null;
  }

  load(storyBytes, filename = "story.z5", seed = 0) {
    const bytes = storyBytes instanceof Uint8Array
      ? storyBytes
      : new Uint8Array(storyBytes);
    if (!bytes.length) throw new Error("The story file is empty.");

    if (this.storyPath) this.close();
    const safeName = filename.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_") || "story.z5";
    this.storyPath = `/${safeName}`;
    this.module.FS.writeFile(this.storyPath, bytes);
    this.#clearOutput();

    try {
      return this.#callText("setup", ["string", "number", "number", "number"], [
        this.storyPath, seed, 0, 0,
      ]);
    } catch (error) {
      this.#remove(this.storyPath);
      this.storyPath = null;
      throw error;
    }
  }

  step(command) {
    this.#requireStory();
    const value = command.trim();
    if (!value) throw new Error("Command is required.");
    if (textEncoder.encode(value).length > MAX_COMMAND_BYTES) {
      throw new RangeError(`Command exceeds ${MAX_COMMAND_BYTES} UTF-8 bytes.`);
    }

    const observation = this.#callText("step", ["string"], [`${value}\n`]);
    return { observation, ...this.status() };
  }

  status() {
    this.#requireStory();
    return {
      score: this.#number("get_score"),
      moves: this.#number("get_moves"),
      done: Boolean(this.#number("game_over") || this.#number("victory")),
      halted: Boolean(this.#number("halted")),
    };
  }

  object(number) {
    this.#requireStory();
    if (!Number.isInteger(number) || number < 1) return null;
    if (!this.#callNumber(["zbabel_object_exists", "zai_object_exists"], ["number"], [number])) return null;
    return {
      number,
      name: this.#callText(["zbabel_object_name", "zai_object_name"], ["number"], [number]),
      parent: this.#objectNumber(["zbabel_object_parent", "zai_object_parent"], number),
      child: this.#objectNumber(["zbabel_object_child", "zai_object_child"], number),
      sibling: this.#objectNumber(["zbabel_object_sibling", "zai_object_sibling"], number),
    };
  }

  playerLocation() {
    this.#requireStory();
    return this.object(this.#number(["zbabel_player_location", "zai_player_location"]));
  }

  inventory() {
    this.#requireStory();
    const inventory = [];
    const visited = new Set();
    const limit = this.#number("get_num_world_objs");
    let number = this.#number(["zbabel_inventory_first", "zai_inventory_first"]);
    while (number > 0 && inventory.length < limit && !visited.has(number)) {
      visited.add(number);
      const item = this.object(number);
      if (!item) break;
      inventory.push(item);
      number = item.sibling;
    }
    return inventory;
  }

  dictionary() {
    this.#requireStory();
    return this.#callText(["zbabel_dictionary", "zai_dictionary"], ["string"], [this.storyPath])
      .split("\n")
      .filter(Boolean);
  }

  save() {
    this.#requireStory();
    const path = "/zbabel-save.qzl";
    this.#remove(path);
    const saved = this.module.ccall("save", "number", ["string"], [path]);
    this.#clearOutput();
    if (saved <= 0) {
      throw new Error("Jericho could not save the current game.");
    }
    const bytes = this.module.FS.readFile(path).slice();
    this.#remove(path);
    return bytes;
  }

  restore(saveBytes) {
    this.#requireStory();
    const bytes = saveBytes instanceof Uint8Array
      ? saveBytes
      : new Uint8Array(saveBytes);
    if (!bytes.length) throw new Error("The save file is empty.");

    const path = "/zbabel-restore.qzl";
    this.#remove(path);
    this.module.FS.writeFile(path, bytes);
    const restored = this.module.ccall("restore", "number", ["string"], [path]);
    this.#clearOutput();
    this.#remove(path);
    if (restored <= 0) throw new Error("Jericho could not restore the save file.");
    return this.status();
  }

  close() {
    if (!this.storyPath) return;
    const path = this.storyPath;
    this.module.ccall("shutdown", null, [], []);
    this.#clearOutput();
    this.storyPath = null;
    this.#remove(path);
  }

  #callText(names, argumentTypes, arguments_) {
    const pointer = this.#callNumber(names, argumentTypes, arguments_);
    if (!pointer) return "";
    const heap = this.module.HEAPU8;
    let end = pointer;
    while (heap[end]) end += 1;
    return textDecoder.decode(heap.subarray(pointer, end));
  }

  #number(names) {
    return this.#callNumber(names, [], []);
  }

  #objectNumber(names, number) {
    return this.#callNumber(names, ["number"], [number]);
  }

  #callNumber(names, argumentTypes, arguments_) {
    const candidates = Array.isArray(names) ? names : [names];
    let lastError;
    for (const name of candidates) {
      try {
        return this.module.ccall(name, "number", argumentTypes, arguments_);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  #remove(path) {
    try {
      this.module.FS.unlink(path);
    } catch (error) {
      if (error?.errno !== 44) throw error;
    }
  }

  #clearOutput() {
    try {
      this.module.ccall("zbabel_clear_output", null, [], []);
    } catch {
      this.module.ccall("zai_clear_output", null, [], []);
    }
  }

  #requireStory() {
    if (!this.storyPath) throw new Error("Load a story before using Jericho.");
  }
}

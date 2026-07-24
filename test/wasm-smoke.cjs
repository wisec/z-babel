const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const build = path.join(root, "build");
const storyArgument = process.argv[2];
const story = path.resolve(storyArgument || path.join(root, "my_jericho/tests/data/905.z5"));

async function main() {
  const createJericho = require(path.join(build, "jericho.js"));
  const { JerichoEngine } = await import("../src/jericho-engine.mjs");
  const engine = await JerichoEngine.create(createJericho, {
    locateFile: (name) => path.join(build, name),
  });

  try {
    const opening = engine.load(fs.readFileSync(story), path.basename(story));
    assert.ok(opening.trim(), "setup should return the opening narrative");

    const turn = engine.step("look");
    assert.ok(turn.observation.trim(), "look should return narrative text");
    const location = engine.playerLocation();
    if (!storyArgument) {
      assert.ok(location?.name, "the default fixture should expose a named player location");
    }
    const inventory = engine.inventory();
    assert.ok(Array.isArray(inventory), "inventory should be an array");
    const dictionary = engine.dictionary();
    assert.ok(dictionary.length > 0, "the story dictionary should not be empty");
    assert.ok(dictionary.includes("look"), "the story dictionary should contain common commands");
    const movesAtSave = turn.moves;
    const save = engine.save();
    assert.ok(save.length > 0, "save should return Quetzal bytes");

    const changed = engine.step("wait");
    assert.ok(changed.observation.trim(), "wait should return narrative text");
    const restored = engine.restore(save);
    if (!storyArgument) {
      assert.equal(restored.moves, movesAtSave, "restore should recover the saved move counter");
    }

    console.log(JSON.stringify({
      story: path.basename(story),
      openingBytes: Buffer.byteLength(opening),
      turnBytes: Buffer.byteLength(turn.observation),
      location: location?.name || null,
      inventory: inventory.map((item) => item.name),
      dictionaryWords: dictionary.length,
      saveBytes: save.length,
      movesAtSave,
      restoredMoves: restored.moves,
    }));
  } finally {
    engine.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

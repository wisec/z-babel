import assert from "node:assert/strict";
import { GameSession, cleanObservation, directionFromCommand, storyFingerprint } from "../src/game-session.js";

assert.equal(directionFromCommand("w"), "west");
assert.equal(directionFromCommand("go north"), "north");
assert.equal(directionFromCommand("ENTER house"), "enter");
assert.equal(directionFromCommand("stand"), "up");
assert.equal(directionFromCommand("stand up"), "up");
assert.equal(directionFromCommand("take lamp"), null);
assert.equal(cleanObservation(">\n> Look here.\n>"), "Look here.");
assert.equal(
  await storyFingerprint(new Uint8Array([1, 2, 3]), null),
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
);

const locations = [
  { number: 1, name: "Start" },
  { number: 2, name: "West room" },
  { number: 1, name: "Start" },
  { number: 3, name: "North room" },
  { number: 4, name: "Unexpected transition" },
];
let locationIndex = 0;
const engine = {
  load: () => "Opening",
  playerLocation: () => locations[locationIndex],
  step: () => {
    locationIndex += 1;
    return { observation: "Moved", score: 0, moves: locationIndex, done: false, halted: false };
  },
  status: () => ({ score: 0, moves: locationIndex, done: false, halted: false }),
  inventory: () => [],
  save: () => new Uint8Array([1]),
  restore: () => {},
};

const session = await GameSession.create(engine, new Uint8Array([1, 2, 3]), "test.z5");
session.step("west", "ovest");
let map = session.snapshot().map;
assert.equal(session.commandHistory[0], "ovest");
assert.deepEqual(session.history[1], { command: "west", userCommand: "ovest", text: "Moved" });
assert.deepEqual(map.rooms.find((room) => room.id === "2"), { id: "2", name: "West room", x: -1, y: 0 });
session.step("east");
session.step("north");
map = session.snapshot().map;
assert.deepEqual(map.rooms.find((room) => room.id === "3"), { id: "3", name: "North room", x: 0, y: -1 });
session.step("look", "guarda");
map = session.snapshot().map;
assert.equal(new Set(map.rooms.map((room) => `${room.x},${room.y}`)).size, map.rooms.length);
assert.deepEqual(map.edges.at(-1), {
  from: "3", to: "4", direction: "transition", command: "look", userCommand: "guarda",
});

console.log("game-session tests passed");

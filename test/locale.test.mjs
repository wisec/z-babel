import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url);
const localeDir = new URL("src/locales/", root);
const files = fs.readdirSync(localeDir).filter((name) => name.endsWith(".json")).sort();
const english = JSON.parse(fs.readFileSync(new URL("English.json", localeDir), "utf8"));
const englishKeys = Object.keys(english).sort();

assert.ok(files.length > 2, "expected translated locale files");

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(new URL(file, localeDir), "utf8"));
  assert.deepEqual(Object.keys(data).sort(), englishKeys, `${file} keys should match English.json`);
}

const html = fs.readFileSync(new URL("index.html", root), "utf8");
const uiOptions = [...html.matchAll(/<option value="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value !== "target" && files.includes(`${value}.json`));

for (const language of uiOptions) {
  assert.ok(files.includes(`${language}.json`), `${language} should have a locale file`);
}

console.log(`Validated ${files.length} locale files in ${path.relative(process.cwd(), localeDir.pathname)}.`);

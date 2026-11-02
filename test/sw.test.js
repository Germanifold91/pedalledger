// The service worker must precache every app file, or that file is missing offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function listFiles(dir){
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? listFiles(join(dir, d.name)) : [join(dir, d.name)]);
}

test("sw.js precaches exactly the app's js and css files", () => {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const listed = [...sw.matchAll(/"\.\/((?:js|css)\/[^"]+)"/g)].map(m => m[1]).sort();
  const onDisk = [...listFiles("js"), ...listFiles("css")].sort();
  assert.deepEqual(listed, onDisk);
});

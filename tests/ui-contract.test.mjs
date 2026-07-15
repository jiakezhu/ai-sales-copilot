import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Tencent shell uses the supplied QQ penguin and TDesign tokens", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.equal(existsSync(new URL("../assets/qq-penguin-reference.png", import.meta.url)), true);
  assert.match(html, /assets\/qq-penguin-reference\.png/);
  assert.match(html, /class="qq-penguin/);
  assert.match(css, /--td-brand-color:\s*#0052d9/i);
  assert.match(css, /--td-brand-color-hover:\s*#366ef4/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readBinary = path => readFileSync(new URL(`../${path}`, import.meta.url));

test("Tencent shell uses the supplied QQ penguin and TDesign tokens", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.match(css, /--td-brand-color:\s*#0052d9/i);
  assert.match(css, /--td-brand-color-hover:\s*#366ef4/i);
  assert.match(css, /--blue:\s*var\(--td-brand-color\)/i);
  assert.match(css, /--blue-strong:\s*var\(--td-brand-color-active\)/i);
  assert.match(css, /--blue-soft:\s*var\(--td-brand-color-light\)/i);
  assert.match(css, /\.mobile-capture\{[^}]*background:linear-gradient\(145deg,var\(--td-brand-color-hover\),var\(--td-brand-color\)\)/i);
  assert.doesNotMatch(html, /<script\s+src="report\.js"/i);
});

test("QQ penguin asset is byte-for-byte the approved reference", () => {
  const digest = createHash("sha256")
    .update(readBinary("assets/qq-penguin-reference.png"))
    .digest("hex");

  assert.equal(digest, "5eda8ddce51aa85a0fe6688563868229656fcd27b7f9fde27ac59857ccc87f7e");
});

test("desktop and mobile brands both use the approved decorative mascot", () => {
  const html = read("index.html");
  const desktopBrand = html.match(/<button class="brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mobileBrand = html.match(/<button class="mobile-brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mascot = /<span class="qq-penguin qq-penguin--brand" aria-hidden="true">\s*<img src="assets\/qq-penguin-reference\.png" alt="" \/>\s*<\/span>/;

  assert.match(desktopBrand, mascot);
  assert.match(mobileBrand, mascot);
  assert.equal((html.match(/assets\/qq-penguin-reference\.png/g) || []).length, 2);
});

test("application shell preserves every runtime hook consumed by app.js", () => {
  const html = read("index.html");
  const runtimeHooks = [
    "globalSearch",
    "pageRoot",
    "modalLayer",
    "modalPanel",
    "reportLayer",
    "reportDocument",
    "reportStatus",
    "toast",
    "themeToggle"
  ];

  for (const id of runtimeHooks) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing runtime hook #${id}`);
  }
});

test("Today page is ordered as AI, actions, then customer signals", () => {
  const js = read("app.js");
  const ai = js.indexOf('class="ai-assistant-card"');
  const actions = js.indexOf('class="today-action-list"');
  const signals = js.indexOf('class="account-signal-list"');
  assert.ok(ai > 0 && actions > ai && signals > actions);
  assert.match(js, /告诉小企刚刚发生了什么/);
  assert.doesNotMatch(js, /class="metric-strip"/);
});

test("Today surfaces remain readable in dark theme", () => {
  const css = read("style.css");
  assert.match(css, /\[data-theme="dark"\]\s*\{[^}]*--td-bg-container:\s*var\(--surface\)/s);
  assert.match(css, /\.ai-assistant-card\s*\{[^}]*background:[^}]*var\(--surface\)/s);
  assert.doesNotMatch(css, /\.ai-assistant-card\s*\{[^}]*#fff\s+72%/s);
});

test("mobile Today actions keep their date chips visible", () => {
  const css = read("style.css");
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.today-action-list \.date-chip\s*\{[^}]*display:\s*inline-flex[^}]*white-space:\s*normal/i);
});

test("copilot attachments are read, reviewed, and saved with the note", () => {
  const js = read("app.js");
  assert.match(js, /target\.id === "copilotFiles"/);
  assert.match(js, /AssetEngine\.readFile\(file\)/);
  assert.match(js, /id="copilotFileStatus"/);
  assert.match(js, /attachments:\s*\[\.\.\.state\.copilotAttachments\]/);
  assert.match(js, /customer\.assets\.push\(\.\.\.attachments\)/);
  assert.match(js, /attachments,\s*\n?\s*\}\);/);
});

test("outlined TDesign button uses the hover brand token", () => {
  const css = read("style.css");
  assert.match(css, /\.td-button--outline:hover\s*\{[^}]*var\(--td-brand-color-hover\)/);
});

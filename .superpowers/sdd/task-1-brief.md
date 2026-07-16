### Task 1: Design tokens, QQ penguin asset, and application shell

**Files:**
- Create: `assets/qq-penguin-reference.png`
- Create: `tests/ui-contract.test.mjs`
- Modify: `index.html:1-73`
- Modify: `style.css:1-100`

**Interfaces:**
- Consumes: supplied image `/var/folders/44/642spf6x72v4vrwcs6nj54nw0000gn/T/codex-clipboard-6313586b-29f5-4bb7-a18b-496935a94faf.png`
- Produces: `.qq-penguin`, `.app-shell`, `.side-nav`, `.topbar`, and TDesign token variables used by all later tasks.

- [ ] **Step 1: Write the failing shell contract test**

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because the asset and TDesign tokens do not exist.

- [ ] **Step 3: Add the exact image asset and shell markup**

Copy the supplied binary without redrawing it:

```bash
mkdir -p assets
cp /var/folders/44/642spf6x72v4vrwcs6nj54nw0000gn/T/codex-clipboard-6313586b-29f5-4bb7-a18b-496935a94faf.png assets/qq-penguin-reference.png
```

Replace the brand mark in `index.html` with the crop wrapper, and use the same element in the mobile brand:

```html
<span class="qq-penguin qq-penguin--brand" aria-hidden="true">
  <img src="assets/qq-penguin-reference.png" alt="" />
</span>
```

Load the pure report builder before `app.js`:

```html
<script src="report.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Replace the root style tokens and mascot crop**

```css
:root {
  --td-brand-color: #0052d9;
  --td-brand-color-hover: #366ef4;
  --td-brand-color-active: #003cab;
  --td-brand-color-light: #f2f3ff;
  --td-bg-page: #f3f6f9;
  --td-bg-container: #ffffff;
  --td-bg-secondary: #f5f7fa;
  --td-text-primary: rgba(0, 0, 0, .9);
  --td-text-secondary: rgba(0, 0, 0, .6);
  --td-text-placeholder: rgba(0, 0, 0, .4);
  --td-border: #dcdfe6;
  --td-success: #00a870;
  --td-warning: #ed7b2f;
  --td-error: #d54941;
  --td-radius: 6px;
  --td-radius-lg: 10px;
  --td-shadow-1: 0 1px 4px rgba(0, 0, 0, .08);
  --font: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.qq-penguin {
  position: relative;
  display: inline-block;
  overflow: hidden;
  flex: none;
  background: #fff;
}
.qq-penguin img {
  position: absolute;
  width: 98px;
  height: 124px;
  left: -15px;
  top: -22px;
  max-width: none;
}
.qq-penguin--brand { width: 46px; height: 46px; border-radius: 12px; }
```

- [ ] **Step 5: Run the shell contract and syntax checks**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

- [ ] **Step 6: Commit the shell foundation**

```bash
git add assets/qq-penguin-reference.png tests/ui-contract.test.mjs index.html style.css
git commit -m "feat: add Tencent QQ visual foundation"
```


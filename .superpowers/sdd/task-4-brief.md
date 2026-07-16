### Task 4: Give the QQ penguin controlled AI states

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `app.js:500-680`
- Modify: `style.css:100-165,212-235`

**Interfaces:**
- Consumes: `.qq-penguin`, `state.recording`, `state.aiDraft`, `toast()`, and existing modal workflows.
- Produces: `setAssistantState(state)`, `.assistant-listening`, `.assistant-reviewing`, and `.assistant-success`.

- [ ] **Step 1: Add failing mascot-boundary and AI-state tests**

```js
test("QQ penguin is controlled by explicit assistant states", () => {
  const js = read("app.js");
  assert.match(js, /function setAssistantState\(assistantState\)/);
  assert.match(js, /setAssistantState\("listening"\)/);
  assert.match(js, /setAssistantState\("reviewing"\)/);
  assert.match(js, /setAssistantState\("success"\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because no assistant-state helper exists.

- [ ] **Step 3: Implement state changes without redrawing the mascot**

```js
function setAssistantState(assistantState) {
  const card = $("#copilotCard");
  if (!card) return;
  card.classList.remove("assistant-listening", "assistant-reviewing", "assistant-success");
  if (assistantState !== "idle") card.classList.add(`assistant-${assistantState}`);
}
```

Call `setAssistantState("listening")` when speech recognition begins, `setAssistantState("idle")` when it ends, `setAssistantState("reviewing")` after AI candidates render, and `setAssistantState("success")` after confirmed persistence. Reset success to idle after 1200ms.

- [ ] **Step 4: Add restrained state motion**

```css
.assistant-listening .qq-penguin--assistant{animation:assistantBreath 1.2s ease-in-out infinite}
.assistant-reviewing .ai-assistant-card{border-color:var(--td-brand-color-hover)}
.assistant-success .ai-assistant-card{border-color:var(--td-success);background:linear-gradient(100deg,#e8f8f2,#fff 72%)}
@keyframes assistantBreath{50%{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,82,217,.2)}}
@media(prefers-reduced-motion:reduce){.assistant-listening .qq-penguin--assistant{animation:none}}
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

```bash
git add tests/ui-contract.test.mjs app.js style.css
git commit -m "feat: add restrained QQ assistant states"
```


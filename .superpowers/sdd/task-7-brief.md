### Task 7: Complete mobile behavior, accessibility, and documentation

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `style.css`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: all UI and report classes from Tasks 1-6.
- Produces: final 390px layout, reduced-motion behavior, accessible labels, and handoff documentation.

- [ ] **Step 1: Add failing responsive and boundary contracts**

```js
test("mobile and mascot boundaries are explicit", () => {
  const css = read("style.css");
  const js = read("app.js");
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(js.slice(js.indexOf("function buildReport"), js.indexOf("function exportWordReport")), /qq-penguin|企鹅|assets\//);
});
```

- [ ] **Step 2: Run the test and verify it fails if any boundary is missing**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL until all responsive and mascot boundaries are present.

- [ ] **Step 3: Add final responsive rules**

```css
@media(max-width:900px){.side-nav{display:none}.app-main{margin-left:0}.mobile-nav{display:grid}.today-layout,.analytics-workspace{grid-template-columns:1fr}.ai-assistant-card{padding:20px 18px 18px 82px}.qq-penguin--assistant{left:18px;top:20px}}
@media(max-width:680px){.page{padding:20px 14px 88px}.today-command{align-items:flex-start}.today-command .td-button--outline{display:none}.ai-assistant-card{padding:78px 14px 14px}.qq-penguin--assistant{left:14px;top:14px}.customer-worktable .table-head{display:none}.customer-row{display:grid;grid-template-columns:1fr auto}.report-document{width:100%;margin:0;padding:28px 18px}.report-field-grid{grid-template-columns:1fr}.report-progress article{grid-template-columns:1fr;gap:4px}}
```

- [ ] **Step 4: Update documentation with final behavior**

Add these exact points to both handoff documents:

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
node --test tests/ui-contract.test.mjs
node --check app.js
node --check report.js
node --check data.js
node --check crm.js
git diff --check
```

Expected: all Node tests PASS, all syntax checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit the responsive and documentation finish**

```bash
git add tests/ui-contract.test.mjs style.css index.html README.md HANDOVER.md
git commit -m "feat: finish Tencent QQ responsive experience"
```

## Final Acceptance Checklist

- [ ] The exact supplied QQ penguin is visible in product brand and AI assistant states.
- [ ] No approximate or generated penguin artwork exists.
- [ ] Today prioritizes AI capture, next actions, and customer signals in that order.
- [ ] Customer, task, and analytics views use a consistent TDesign-style professional workspace.
- [ ] Desktop and 390px mobile layouts remain usable without overflow.
- [ ] AI text, voice fallback, manual entry, confirmation, and persistence continue to work.
- [ ] Customer detail tabs, stage/grade controls, timeline, relationships, and evidence remain functional.
- [ ] Report HTML, PDF, and Word exclude empty content, product explanations, mascot imagery, and decorative footers.
- [ ] All automated contracts and JavaScript syntax checks pass.

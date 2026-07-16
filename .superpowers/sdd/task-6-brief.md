### Task 6: Apply professional report, Word, and print styling

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `style.css:212-235`
- Modify: `app.js:690-740`

**Interfaces:**
- Consumes: report markup from `ReportBuilder.build()`.
- Produces: consistent `.report-heading`, `.report-section`, `.report-field-grid`, `.report-progress`, screen preview, A4 print, and Word styles.

- [ ] **Step 1: Add failing report-style contracts**

```js
test("report styles are content-first and printable", () => {
  const css = read("style.css");
  assert.match(css, /\.report-heading/);
  assert.match(css, /\.report-field-grid/);
  assert.match(css, /@page\s*\{\s*size:\s*A4/);
  assert.doesNotMatch(css, /\.report-brand|\.report-footer/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because legacy cover/brand/footer styles remain.

- [ ] **Step 3: Replace legacy report styles**

```css
.report-document{width:min(860px,calc(100% - 32px));margin:24px auto 60px;padding:54px 62px;color:#172b4d;background:#fff;box-shadow:0 12px 36px rgba(32,46,66,.12)}
.report-heading{padding-bottom:24px;border-bottom:3px solid var(--td-brand-color)}
.report-heading>p{color:var(--td-brand-color);font-size:12px;font-weight:700;letter-spacing:.08em}.report-heading h1{margin:8px 0 16px;font:700 34px/1.2 "Songti SC","Microsoft YaHei",serif}.report-heading>div{display:flex;gap:8px;flex-wrap:wrap}.report-heading span{padding:5px 8px;background:#f2f3f5;font-size:11px}
.report-section{margin-top:34px}.report-section h2{margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #dfe3e8;font-size:18px}
.report-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.report-field-grid>div{padding:12px;border-left:3px solid #d9e1ff;background:#f7f9fc}.report-field-grid span{color:#66717d;font-size:10px}.report-field-grid p{margin-top:5px;font-size:12px;line-height:1.6}
.report-progress article{display:grid;grid-template-columns:112px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid #edf0f2}.report-progress time{color:#7a8491;font-size:10px}.report-progress p{margin:4px 0;font-size:11px;line-height:1.6}.report-progress small{color:var(--td-brand-color)}
.report-document table{width:100%;border-collapse:collapse;font-size:11px}.report-document th,.report-document td{padding:9px;border:1px solid #dfe3e8;text-align:left;vertical-align:top}.report-document th{background:#f3f6f9}
@media print{@page{size:A4;margin:14mm}.report-document{width:100%;margin:0;padding:0;box-shadow:none}.report-section{break-inside:avoid}.page-break{break-before:page}}
```

- [ ] **Step 4: Make Word styling match the same hierarchy**

Pass the following CSS into `ReportBuilder.wrapWord(html, styles)` and update `wrapWord` to emit it inside the document `<head>`:

```js
const WORD_REPORT_STYLES = `
  body{margin:36px;font-family:Arial,'Microsoft YaHei',sans-serif;color:#172b4d;line-height:1.6}
  .report-heading{padding-bottom:20px;border-bottom:3px solid #0052d9}
  .report-heading>p{color:#0052d9;font-size:12px;font-weight:700}.report-heading h1{margin:8px 0 14px;font-size:32px}.report-heading span{margin-right:6px;padding:5px 8px;background:#f2f3f5;font-size:11px}
  .report-section{margin-top:30px}.report-section h2{padding-bottom:8px;border-bottom:1px solid #dfe3e8;font-size:18px}
  .report-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.report-field-grid>div{padding:12px;border-left:3px solid #d9e1ff;background:#f7f9fc}
  table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dfe3e8;text-align:left;vertical-align:top}th{background:#f3f6f9}
  .report-progress article{padding:10px 0;border-bottom:1px solid #edf0f2}.report-progress time{color:#7a8491;font-size:11px}.report-progress small{color:#0052d9}
`;
const doc = ReportBuilder.wrapWord($("#reportDocument").innerHTML, WORD_REPORT_STYLES);
```

Update the builder signature exactly:

```js
function wrapWord(html, styles) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>${html}</body></html>`;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js && git diff --check`  
Expected: PASS.

```bash
git add tests/ui-contract.test.mjs style.css app.js
git commit -m "feat: polish report preview and exports"
```


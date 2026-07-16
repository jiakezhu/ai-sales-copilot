# Task 2 Report — Rebuild Today around AI and next actions

## Status

Implemented and verified.

## Delivered changes

- Reordered the Today page to present the QQ Penguin AI assistant first, priority actions second, and customer signals third.
- Replaced the metric-first Today hierarchy with `.today-command`, `.ai-assistant-card`, `.today-action-list`, and `.account-signal-list`.
- Added focused render helpers immediately below `renderToday()`:
  - `renderCopilotComposer()` owns the existing AI input, attachment, voice, and analysis controls.
  - `renderTodayActions(priority, overdue)` owns the action heading, overdue summary, and existing priority task rows.
  - `renderCustomerSignals(stale)` owns the customer signal heading and existing account pulse rendering.
- Preserved runtime hooks and actions: `#copilotInput`, `#copilotFiles`, `#aiDraft`, `manual-entry`, `voice`, `analyze-ai`, task completion, customer navigation, and page navigation.
- Added TDesign-token-based Today layout, assistant card, outline button, panel styling, and mobile adaptations.
- Used the approved `assets/qq-penguin-reference.png` inside the AI assistant card.

## Contract conflict resolution

The supplied test searches for exact strings `class="today-action-list"` and `class="account-signal-list"`, while the supplied markup example combines each with `td-panel` in the same class attribute. Because the exact test cannot match the combined class value, the business classes are on the outer semantic `section`/`aside` and `.td-panel` is on an inner panel container. This preserves the required ordering contract and panel semantics without weakening or modifying the test.

## TDD evidence

### RED

Command:

`node --test tests/ui-contract.test.mjs`

Observed result: 4 passed, 1 failed. The new Today-page contract failed at the ordering assertion because the new assistant/action/signal classes did not yet exist and the old metric-first layout remained.

### GREEN

Command:

`node --test tests/ui-contract.test.mjs && node --check app.js`

Observed result: all 5 tests passed, 0 failed; JavaScript syntax check exited successfully.

## Self-review

- Requirement order is explicit in `renderToday()` and covered by the contract test.
- Each new helper returns only its owned markup and delegates rows to the existing `renderPriorityTask()` / `renderAccountPulse()` helpers.
- The old Today metric strip was removed while `metricCard()` remains available for the Analytics page.
- Existing IDs and `data-action` hooks used by event handlers remain unchanged.
- Responsive rules collapse the two-column Today layout and keep the assistant mascot/copy/composer readable on narrow screens.
- `git diff --check` reported no whitespace errors.
- Unrelated dirty `README.md` and `HANDOVER.md` were not edited or staged.

## Concerns / workspace note

`app.js` already contained the larger uncommitted application rewrite when Task 2 began. Per the task instruction to work on the current checkout and commit Task 2 files, the commit includes the current `app.js` file state; the Today-specific implementation is localized to the render block and its three helpers. No functional concern was found in the requested Today flow.

## Review fixes

An independent review found four Today-page issues after the initial commit. They were addressed in a follow-up TDD cycle:

- Dark mode now remaps the TDesign surface, text, border, shadow, and brand tokens to the existing dark-theme palette. The assistant gradient also uses `var(--surface)` and `var(--blue-soft)` instead of hard-coded light colors.
- At mobile widths, Today task rows wrap compactly and explicitly restore `.date-chip` as `inline-flex`, so overdue, today, and promised-date labels remain visible at 390px.
- `#copilotFiles` now has a real asynchronous change flow using `AssetEngine.readFile()` and `AssetEngine.makeAsset()`. Selected file metadata is visible under the composer, copied into the AI draft, displayed during review, and saved to both `customer.assets` and the confirmed note's `attachments` array.
- The outlined TDesign button now uses `--td-brand-color-hover` for hover border and text color.

### Review-fix RED evidence

Command:

`node --test tests/ui-contract.test.mjs`

Observed result before implementation: 5 passed, 4 failed. The four failures independently identified missing dark-theme surface mapping, hidden mobile date chips, absent copilot attachment persistence, and the incorrect outline hover token.

### Review-fix focused GREEN evidence

- `node --test --test-name-pattern="Today surfaces|mobile Today actions|outlined TDesign" tests/ui-contract.test.mjs` — 3 passed, 0 failed.
- `node --test --test-name-pattern="copilot attachments" tests/ui-contract.test.mjs && node --check app.js` — 1 passed, 0 failed; syntax valid.

### Review-fix self-review

- Attachment objects use the same `AssetEngine` metadata shape and customer asset/note attachment relationship as manual entry.
- Changing the selected files after analysis updates the live AI draft before confirmation.
- Empty selection clears pending copilot attachments, and successful confirmation clears composer attachment state.
- The mobile date-chip override is scoped to `.today-action-list`, avoiding layout changes to unrelated pages.
- No report-generation logic, README content, or HANDOVER content was modified.

### Review-fix final verification

Command:

`node --test tests/ui-contract.test.mjs && node --check app.js && git diff --check`

Observed result: all 9 contract tests passed, JavaScript syntax was valid, and the diff check reported no whitespace errors.

Follow-up commit: `ebd189f fix: harden Today interactions and themes`.

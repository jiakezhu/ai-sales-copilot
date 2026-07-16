# Task 1 Implementation Report

## Status

Implemented the Tencent shell foundation with the supplied QQ penguin reference and the required TDesign token layer.

## Files committed

- `assets/qq-penguin-reference.png`
- `tests/ui-contract.test.mjs`
- `index.html`
- `style.css`

No unrelated paths were staged. Existing changes in `README.md`, `HANDOVER.md`, and `app.js` were preserved outside the Task 1 commit.

## TDD evidence

1. Added the supplied shell contract test before production changes.
2. Ran `node --test tests/ui-contract.test.mjs` and observed the expected failure at the missing asset assertion (`false !== true`).
3. Copied the approved reference asset, added desktop/mobile mascot markup, inserted `report.js` before `app.js`, and added the required token/crop CSS.
4. Re-ran the focused contract and syntax checks successfully.

## Verification

- Focused: `node --test tests/ui-contract.test.mjs && node --check app.js` — PASS (1 test, 0 failures).
- Full: `node --test` plus `node --check` for every existing top-level JavaScript file — PASS (1 test, 0 failures; all files parse).
- Hygiene: `git diff --check` — PASS.
- Asset fidelity: source and destination SHA-256 both equal `5eda8ddce51aa85a0fe6688563868229656fcd27b7f9fde27ac59857ccc87f7e`; copied file is a 98 × 124 RGBA PNG.

## Self-review

- The desktop and mobile brand controls both use the same `.qq-penguin.qq-penguin--brand` wrapper and approved image path.
- The mascot image is decorative (`alt=""`, wrapper `aria-hidden="true"`) while each containing brand button retains an accessible label.
- All required TDesign variables and exact values are present.
- The exact mascot crop dimensions and offsets are present.
- The existing `.app-shell`, `.side-nav`, and `.topbar` structure was retained.
- `report.js` is loaded immediately before `app.js` as specified.

## Concerns

- `report.js` is intentionally not created in Task 1; the implementation plan assigns it to Task 5. Until that task lands, a browser may log a missing-script request while continuing to load `app.js`.

## Commit

`d83e397 feat: add Tencent QQ visual foundation`

## Review fix pass

The Task 1 review findings were addressed in a separate TDD cycle:

- Expanded the UI contract from one broad check to four focused contracts covering the exact approved PNG SHA-256, independent desktop and mobile mascot placements, all shell IDs consumed by `app.js`, and tokenized shell actions.
- Removed the premature `report.js` script request. Task 5 will add the script tag together with the actual file.
- Mapped the legacy action aliases to the TDesign brand, active, and light tokens.
- Replaced the mobile capture action gradient's hardcoded `#7659df` / `#2864dc` colors with TDesign token variables.
- Preserved all current runtime hooks and did not change `app.js` or report styling.

The review contract first failed as expected on `--blue: #2864dc`, proving the new token assertion detected the issue. After the minimal fixes, the exact focused command `node --test tests/ui-contract.test.mjs && node --check app.js && git diff --check` produced:

```text
✔ Tencent shell uses the supplied QQ penguin and TDesign tokens (0.574791ms)
✔ QQ penguin asset is byte-for-byte the approved reference (0.589125ms)
✔ desktop and mobile brands both use the approved decorative mascot (0.158167ms)
✔ application shell preserves every runtime hook consumed by app.js (0.131625ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 32.875
```

`node --check app.js` and `git diff --check` completed silently with exit code 0 as part of the same command.

### Review-fix concerns

None. The missing `report.js` request noted above is resolved; the report script load now remains correctly deferred until Task 5 creates the file.

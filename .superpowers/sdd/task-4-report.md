# Task 4 Report: Controlled QQ Assistant States

## Status

Complete. The QQ AI assistant now uses explicit `idle`, `listening`, `reviewing`, and `success` states without changing existing business data structures, action IDs, attachment persistence, or report code.

## Commit

Primary implementation: `9c3185b feat: add restrained QQ assistant states`

Review fix: `60829b4 fix: reconcile QQ assistant workflow state`

Review follow-up: `1562104 fix: preserve listening while rerendering AI draft`

The commit contains only:

- `app.js`
- `style.css`
- `tests/ui-contract.test.mjs`

## Implementation

- Added `setAssistantState(assistantState)` as the single assistant-card state transition helper.
- Added derived-state reconciliation after every `renderApp()` pass so a rebuilt Today card restores `listening` during recording or `reviewing` when a draft exists.
- Reused the existing voice workflow for `listening`, AI draft rendering for `reviewing`, and confirmed persistence flow for `success`.
- Success resets to `idle` after 1200ms; every newer state cancels the older reset timer.
- A DOM rebuild redraws an active success state without restarting its timer, so rerenders neither swallow nor extend the short feedback state.
- Speech recognition end reconciles against the workflow: an existing AI draft returns to `reviewing`; only a flow without a draft returns to `idle`.
- Direct AI draft rerenders also reconcile instead of forcing `reviewing`, so target-selection changes and attachment-driven rerenders preserve higher-priority `listening` while recording.
- State classes are applied directly to `#copilotCard`, so the matching selectors use `.ai-assistant-card.assistant-*`.
- Motion is limited to a 2px assistant-penguin breath during listening and is disabled under `prefers-reduced-motion: reduce`.
- Reviewing and success use restrained TDesign token-based border/background feedback that remains compatible with dark theme.
- No mascot or animation was added to customer worktables, metrics, analytics, or reports.

## TDD Evidence

- RED: `node --test tests/ui-contract.test.mjs` failed with 19 passing and 2 failing tests because the state helper and state styles did not exist.
- GREEN: the suite passes after implementing the helper, workflow calls, state selectors, timer handling, and reduced-motion override.
- Added behavior coverage proving state classes are mutually replaced and a pending success reset is canceled by a newer listening state.
- Review RED: the expanded executable workflow suite failed with 21 passing and 3 failing tests because reconciliation did not exist.
- Review GREEN: executable tests now cover speech end with an existing draft and a rebuilt Today card during recording, including success-timer preservation.
- Follow-up RED: the target-selection workflow test failed with 24 passing and 1 failing test because direct `renderAIDraft()` forced `reviewing`.
- Follow-up GREEN: the same executable `handleChange → renderAIDraft` path now preserves `listening` during active speech capture.

## Verification

- `node --test tests/ui-contract.test.mjs`: 25/25 passed.
- `node --check app.js`: passed.
- `git diff --check`: passed.

## Concerns

None for Task 4. The working tree still contains pre-existing user changes to `README.md` and `HANDOVER.md`, plus the untracked `.superpowers/` working materials; none were included in the Task 4 commit.

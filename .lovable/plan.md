# Fix plan: developer test report 3 November 2026

## What the report says (verified against the code)

Four open bugs. Two previously failing areas (coordinator access, Join a team) passed their retests. The earlier registration/paste/access-pass findings (C01–C03, C05, C06) were fixed and verified in the last round. The report's "outcome edits visible immediately after publish" note is expected behaviour per your decision: one publish step; admin's marks and statuses stay private until Publish; after publishing, updates flow straight through with no second publish step.

## Bug 1 — Stage 1 final submission always fails (High)

**Bug:** A team completes the one-pager, clicks Submit for review, confirms — the entry stays a Draft and an error appears: `operator does not exist: uuid = text`. Ordinary autosave works fine.

**Root cause (confirmed in code):** inside the save-submission database function, the attachment check that runs only on final submit compares a UUID column with a text value pulled from the form payload: `f.submission_id = p_payload->>'id'`. That comparison is invalid in Postgres, so every final submit errors out while every autosave (which skips that branch) succeeds.

**Associated defects found in the same area:**
- The raw database error text is shown to students in a toast — should be plain language.
- The attachment check keys off the payload id instead of the draft row's own id; a submit without a prior saved draft would fail for the wrong reason.
- Both auto-submit paths (the daily deadline job and the on-visit finaliser) flip any draft to Submitted with no validation — an entry with no title, answers or attachments can reach judges. Per your decision, only drafts that meet the same requirements as manual submit (title, required answers, at least one attachment) get auto-submitted; incomplete drafts stay drafts and the student sees a clear "deadline passed — your draft is missing X" message next visit.

**Fix:** one database migration rewriting the three functions (shared validation helper), plus friendly error mapping in the submission form.

## Bug 2 — Round 1 entries never reach the judge queue (High)

**Bug:** An evaluator assigned to AgriTech sees only SII-002 and SII-003 (both final-stage). SII-001, submitted for Round 1, is absent.

**Root cause (confirmed in code):** the judge queue query is hardcoded to stage 2 submissions only. Round 1 (stage 1) entries are never listed, so Round 1 judging is impossible — yet the admin Results Round 1 tab already displays judge scores, so Round 1 scoring is intended.

**Fix:** round-aware evaluator queue — "Round 1" and "Round 2" tabs (a single-stage competition shows one queue). Round 1 lists stage-1 submitted entries in the evaluator's assigned themes, still anonymous team codes. The evaluation sheet itself is already stage-agnostic and needs no change. Empty-state copy updated.

## Bug 3 — Lovable badge blocks mobile bottom navigation (Medium)

**Bug:** On the live site at phone width, the "Edit with Lovable" badge sits over the bottom navigation; tapping Submission opens the badge instead.

**Root cause:** the badge is injected on the published lovable.app URL, and the bottom navigation is fixed full-width at the very bottom, so they overlap at 360px.

**Fix (your decision):** turn the badge off in publish settings (needs your approval card and a paid plan; it currently shows `hide_badge: false`). A re-publish applies it. If hiding is ever reversed, the fallback is shifting the bottom nav above the badge — not built now.

## Bug 4 — Both resource guides are placeholders (Medium)

**Bug:** "Stage 1 Guide: Writing a Strong Concept Note" and "Toolkit: Data Collection for Student Projects" open `example.com` pages instead of real documents.

**Root cause:** the seeded resource rows point at example.com URLs; the Resources page renders whatever link the row carries (the admin Broadcasts page manages these rows).

**Fix (your decision):** I author two real starter guides as PDFs (concept-note writing; data-collection toolkit) and upload them, then point the two resource rows at the real files — everything downloadable on the platform. When you go live you can send me the official documents and I'll swap them in; admins can also add more resources (links, sessions) themselves from Broadcasts.

## Work order

1. Database migration: fix the submit comparison, use the draft row id, gate both auto-submit paths behind full validation.
2. Submission form: plain-language submit errors + deadline "draft incomplete" messaging.
3. Evaluator queue: Round 1 / Round 2 tabs.
4. Two starter PDF guides uploaded, resource rows repointed.
5. Badge off (approval card), then re-publish.
6. Verify end-to-end in the live app: disposable QA team submits Stage 1 (roster locks, admin shows Submitted), evaluator sees Round 1 entry and can score it, guides open as PDFs, phone-size viewport has no badge overlap. Run the existing test suite.

## Not changing

- One publish step stays as is; post-publish outcome edits show immediately (your call).
- Judge score reset control (report noted its absence but did not claim it as a bug) — flag if you want it.

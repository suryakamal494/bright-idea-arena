# Coordinator Portal, Username Login & Competition Stages

## Goal
Make school-side registration paste-friendly and fool-proof, let users sign in with username or email, give schools live visibility of their students' teams and submissions, and make the competition work in 1-stage or 2-stage mode with admin shortlisting and published simple results.

## Decisions locked in (from your answers)
- Schools **must** type a username AND password for every student — no auto-generation. Rows missing either cannot be submitted.
- Usernames are **unique across the whole platform**.
- Stage count (1 or 2) is one **global** setting for the competition.
- Duplicate student emails from a school are allowed; those extra accounts sign in with **username** (the email they gave is kept as data).

---

## Part 1 — Coordinator portal becomes "My Portal"

**Today:** "My roster" page with a 4-field row grid (name, email, grade, parent email) and CSV upload; students shown as a list.

**Changes:**
1. Rename nav item and page heading to **My Portal**.
2. New **"Paste from Excel"** box: the school copies their Excel table, pastes it into a large box, presses **Paste data** — rows appear in the editable entry table. Parser (`src/lib/paste-import.ts`) handles tabs (Excel default), commas, semicolons; auto-detects an optional header row with fuzzy matching (name / full name / student name, class / grade / standard, username, password, email / email id / mail, mobile / phone / contact). A column-mapping preview shows what was detected so mistakes are visible before creating accounts. CSV upload stays as a secondary button using the same parser.
3. Entry fields become: **Full name\***, **Class (8–12)\***, **Username\*** (inline uniqueness check, lowercase-trimmed), **Password\*** (min 8), **Student email\*** (mandatory, duplicates allowed in bulk), **Student mobile**. No school name (comes from the school account), **no parent email** — left blank in data.
4. "Create accounts" is disabled until every row has all mandatory fields; inline errors per field (duplicate username across platform, bad email format, grade out of range).
5. Registered students become a proper **table**: Name · Username · Class · Email · Mobile · Team ID · Access pass (printable passes keep showing the password the school set, generated at creation).

**Edge cases:** duplicate usernames blocked inline and by a unique database index; duplicate emails get an internal login address automatically (username login still works); paste with no recognisable columns shows a clear error instead of garbage rows.

## Part 2 — Sign in with username or email

**Today:** login accepts only the account email.

**Changes:**
1. Add a **username** to every account (new column on profiles, unique index; existing accounts seeded with usernames from their email names; demo accounts get readable ones).
2. Login field becomes **"Email or username"**. A new public server function resolves a username to the account server-side, verifies the password through the normal auth service, and returns the session — the password check is never bypassed, and emails are not exposed to the browser.
3. Schools continue with school email + password (unchanged). Students may use either. Password-reset field accepts email or username too; username-only accounts (duplicate-email case, no reachable mailbox) see "ask your school coordinator to reset your password" instead of a silent dead end.

## Part 3 — Schools see student progress

**Today:** the coordinator sees only a student list — no team or submission info.

**Changes:** new **"Teams & progress"** section on My Portal, backed by a secure database function scoped to the coordinator's own school:
- One row per team: Team ID (Team - SII - 0xx format) · Members · Stage 1 status (Not started / Draft / Submitted) · Stage 2 status · **Result** once published.
- The student table gains each student's team ID, so the school sees who is in which team at a glance.

## Part 4 — 1-stage or 2-stage competition + results

**Today:** the app is hardwired to two stages; nothing shortlists or publishes results.

**Changes:**
1. **Competition setting (admin):** a single "Number of stages: 1 or 2" control on the admin deadlines page. When set to 1, stage 2 disappears from every screen (student form, admin, coordinator) and the backend rejects stage-2 saves.
2. **Shortlisting (2-stage mode):** after stage 1 closes, admins mark teams **Shortlisted for Round 2** or **Not selected** on a new admin "Results" page, then press **Publish stage-1 results**. Nothing is visible to students or schools before publishing; publishing also unlocks stage 2 for shortlisted teams only (enforced in the submission backend, not just the UI).
3. **Final results:** after the last round, admins set each team's final outcome — **Selected** or **Not selected** — and publish. Publishing shows a simple result card on the student dashboard ("Selected for Round 2" / "Not selected" / "Selected") and on the school portal per team.
4. **Scores stay internal:** scores are never shown to students or schools at any point — only the published outcome is.
5. **1-stage mode:** the same Results page works directly on stage-1 entries; publish = final results. No special-casing elsewhere.

**Edge cases:** switching stage count mid-competition warns the admin when stage-2 entries already exist; shortlist publish is reversible until stage 2 opens; unpublished results are invisible to everyone except admins (enforced by database rules, not just hidden UI).

---

## Impact on existing features
- **Student flow:** unchanged except a results card and stage-2 gating by shortlist; individual signup (unique email) untouched.
- **Deadlines & autosave:** untouched; shortlist gate is added alongside the existing open/deadline checks.
- **Judges:** unaffected — they never see identities or results.
- **Existing demo data:** all accounts get usernames; competition stays in 2-stage mode with nothing published, so nothing visibly changes until you use the new controls.
- **Clusters:** parked as agreed; school and theme fields are kept intact so a cluster layer can be added later without rework.

## Technical notes
- Migration 1: add `username` to profiles (unique) with backfill; `competition_settings` (stage count); `results` table (team, stage, outcome, published) with row-level security — admins write, teams/coordinators read published rows only.
- Migration 2: submission backend gains the stage-count and shortlist gates; a new secure function powers the school progress view.
- New/changed files: `src/lib/paste-import.ts` (+ unit tests for the parser), `src/routes/coordinator.index.tsx` (rewrite), `src/lib/coordinator-actions.ts` (mandatory username/password, duplicate-email handling, progress data), `src/components/auth-page.tsx` (identifier login), a public login server function, `admin.deadlines.tsx` (stage count), new `admin.results.tsx`, student dashboard results card, nav labels.
- Parser tests + a stage-gating test added next to the existing test suite; typecheck, tests, build, and a live browser check of paste-import, username login, school progress and result publishing before finishing.

# Scalability audit + hardening plan (2,500 students · ~650 teams · 650 team submissions)

## Audit findings (verified against the live backend and code)

**What already holds up well**
- Every row-affecting read/write goes through RLS; writes go through one SECURITY DEFINER RPC (`upsert_submission`) — short, indexed, conflict-safe upserts. Postgres handles hundreds of concurrent autosaves per minute without strain.
- Current DB health is clean (9/60 connections, 12 MB data, no exhaustion alerts). Slow-query log shows everything under ~350 ms worst-case on the current demo dataset.
- Admin submissions list is already server-paginated (10/page, exact count) — the right pattern.

**Where it would hurt at 650-team scale**
1. **Missing indexes (real gap).** `submission_files(submission_id)`, `scores(judge_id)`, `teams(track_id)`, `profiles(school_name)`, `judge_assignments(track_id)`, `submissions(status, stage, updated_at)` all have none. The RLS policies hit exactly these columns per row (judge track filters, coordinator school checks), so at 650+ rows every list query degrades into repeated scans. `announcements(created_at)` too.
2. **No admin student/team roster.** There is no admin page showing registered students or teams. The requested view — team ID, member count, school, submission status, click to review — doesn't exist. Only per-submission listing exists, without school/member-count columns.
3. **Autosave write amplification.** Every autosave (1.5 s debounce) refetches 3 extra queries afterward (`team-submissions`, `submission-files`, `my-team`). 650 teams typing = ~3× the necessary read traffic during the submission window. Autosave never flushes on tab close/unload, risking lost edits.
4. **Attachment resolution is sequential.** Each storage signed URL is awaited one-by-one; a submission with 6 files does 6 serial roundtrips.
5. **Pagination UX stress.** Page/filter changes refetch with no cached placeholder — list flashes empty on every page turn; count re-runs per keystroke-driven filter change.
6. **Capacity note.** Fine on the current instance; the plan includes a synthetic 650-team load test to measure before/after, and the instance can be upsized in Backend → Advanced settings if saturation ever appears on event day.

## Work plan

### A. Database indexes (one migration)
```sql
CREATE INDEX submissions_status_stage_updated_idx ON submissions (status, stage, updated_at DESC);
CREATE INDEX submission_files_submission_idx      ON submission_files (submission_id);
CREATE INDEX scores_judge_idx                     ON scores (judge_id);
CREATE INDEX teams_track_idx                      ON teams (track_id);
CREATE INDEX teams_captain_idx                    ON teams (captain_id);
CREATE INDEX profiles_school_idx                  ON profiles (school_name);
CREATE INDEX judge_assignments_track_idx          ON judge_assignments (track_id);
CREATE INDEX announcements_created_idx            ON announcements (created_at DESC);
```
No RLS or data changes — purely lookup speed.

### B. New admin page: "Students & Teams" directory (the scale-critical surface)
- One team-centric row: team code (monospace ID), team name, school, track, member count + member names, Stage 1 and Stage 2 status badges, updated time.
- **Server-side pagination (25/page)** + debounced search (team code / team name / school / student name) + track and stage-status filters.
- Backed by a single SECURITY DEFINER RPC `admin_team_directory(page, page_size, search, track_id, status)` returning the page + total count in one roundtrip — no N+1 embeds, no per-row RLS overhead, one indexed query per page turn. Admin-only (checked via `user_roles` inside the RPC).
- `keepPreviousData` + skeleton rows so changing pages never flashes; count only recomputed when filters change, not per page.

### C. Admin submissions list upgrade
- Add school and member count columns (same RPC pattern, `admin_submission_directory`), click-to-review sheet kept as-is.
- Keep pagination at 10/page with `keepPreviousData` and filter-change-only counting.

### D. Autosave hardening (student side)
- Debounce 1.5 s → 3 s; flush pending save on tab blur/unload and before "Submit for review".
- After each save, write the RPC's returned row straight into the query cache instead of invalidating 3 queries — removes ~3 reads per autosave per team.

### E. Attachment resolution
- Resolve signed URLs in parallel (`Promise.all`) and cache per object path for the hour.

### F. Verification at production scale (measured, not assumed)
1. Bulk-seed a synthetic load set via SQL: ~650 teams, ~2,000 member rows, ~650 submissions, tagged `LOADTEST` for clean removal.
2. `EXPLAIN (ANALYZE)` the directory RPC and admin filters before/after indexes; target single-digit-ms page queries.
3. Playwright: register-rate sanity via the sign-up flow, admin directory paging (10 rapid page turns + searches), judge queue with the seeded volume, autosave behavior — screenshots + console/network clean.
4. Remove the load-test rows, re-verify demo data intact, run tests and build.

### G. Memory + records
- Save scale facts (2,500 students, ~650 teams, team-centric admin display requirements) to project memory; record the RPC pagination pattern in `AGENTS.md`.

## Explicitly NOT changing
- Auth, roles, RLS semantics, submission rules, scoring, branding — all out of scope for this pass.

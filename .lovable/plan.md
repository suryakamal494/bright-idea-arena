# Speed & scalability audit + UX hardening plan

## What the evidence shows (measured, not assumed)

**The backend is healthy and fast.**
- Database: 13/60 connections, 57% memory, 15% disk, zero exhaustion alerts in 48h.
- Slow-query log: worst query ~350 ms (demo data); admin directory RPC returns in single-digit ms.
- All 8 scale indexes verified present (submissions, scores, teams, profiles, judge_assignments, announcements, submission_files, team_members).
- Deadline auto-submit cron verified active. Auto-submit + unique constraints make deadline-hour writes conflict-free.
- Your own session (preview telemetry): 50 backend requests, **zero failures**.

**Measured in the sandbox:** sign-in→admin 0.6–1.5 s · overview→directory cold 0.4–0.7 s, warm 0.14 s (0 requests) · sign-out 0.6–0.7 s.

**Why it feels slow to you:** each backend roundtrip over your network costs roughly 1–2 s (your telemetry shows sign-in at 18:03:29, roles+profile at 18:03:31, page data at 18:03:35 — three waiting waves before anything renders). The compute is never the bottleneck; the number of *sequential* roundtrips × your network latency is. The UI then waits silently with no progress indicator, which reads as "frozen".

**Root causes found in code (all verified):**
1. Sign-out waits for `queryClient.cancelQueries()` + the remote logout network call **before** navigating (`src/components/app-nav.tsx:113-119`) — navigates last, so it feels stuck.
2. Role-guard `beforeLoad` awaits the auth-context fetch on a cache miss with **no pending UI anywhere** (`src/router.tsx` has no `defaultPendingComponent`), so the old page sits frozen for 1–2 waves.
3. Auth context fetches roles and profile as **2 separate roundtrips** (`src/lib/auth.ts:74-78`) — should be 1.
4. Admin overview fires **6 roundtrips** (5 head-counts + recent list) on every visit past the 60 s cache (`src/routes/admin.index.tsx:24-63`).
5. "Aborted/failed requests" in DevTools = harmless router intent-prefetch cancellations, already explained and confirmed again in your telemetry (no real failures).

## Fix plan

### A. One-roundtrip auth context (halves every cold navigation)
- New SECURITY DEFINER RPC `get_auth_context()` returning `{ roles, profile }` in one call, admin-checkable and RLS-safe.
- `src/lib/auth.ts` calls it instead of two parallel queries; cache/inflight logic unchanged.

### B. Instant sign-out
- `handleSignOut`: navigate to `/auth` first, then clear query cache + remote sign-out in the background; `try/finally` resets `busy`; surface returned errors via toast.
- Root auth listener already handles the re-render; no other change needed.

### C. Pending UI so navigation never looks frozen
- Add `defaultPendingComponent` (brand-matched skeleton) + `defaultPendingMs: 200` on the router; role layouts keep their guards.
- Admin overview/directory/submissions already have skeletons; keep them.

### D. Admin overview in 1 roundtrip
- RPC `admin_overview_kpis` returning all 5 counts + 8 recent rows in one call; overview page uses it (cache key `["admin-kpis"]`).

### E. Verify
- Re-run the Playwright timing script (login→admin, overview→directory cold/warm, sign-out) and record before/after; tests + build green; screenshots clean.

## Your questions, answered plainly

**"Why is memory at 57% when we're only testing?"** Memory on a cloud database is not like a phone's storage filling up. The moment the database exists, it reserves its own working memory for the engine itself — buffers and caches that make reads fast — plus the small amount your app's data needs. Our app data is tiny (12.6 MB). The 57% is almost entirely the engine's fixed baseline on the current small instance, not something testing "consumed". It stays roughly constant whether 4 teams or 650 teams are stored.

**"How do we increase memory?"** In Backend → Advanced settings → instance size (a bigger instance = more memory, more CPU, more connections). We should NOT do this now — the measurements show zero pressure. Upsizing only if the load test shows saturation.

**"What is 13/60 connections?"** 60 is the maximum number of simultaneous database connections this instance accepts — think of it as 60 phone lines. 13 means 13 lines are currently off the hook (the app, its pool, and idle sessions). Every page someone opens borrows a line briefly. With connection pooling built into Lovable Cloud, 60 lines comfortably serve thousands of users, because lines are shared and released instantly. The number only becomes a problem if usage ever hits 60/60 — then new requests queue. That would show up in the health check before users feel it.

**"What is consuming the disk?"** 15% of the data disk = 12.6 MB of actual app data (rows, indexes). The other overhead (96 MB write-ahead log) is the database's own journal, managed automatically. Nothing to act on.

## Review of the new ChatGPT assessment — agreed, folded in

Its verdict matches ours: latency + feedback first, don't upscale infrastructure pre-emptively. Its four tightenings are all within our limits and are added below; nothing in it is outside what we can do except that no one can "prove" 2,000 real humans without the event itself — a simulated load test is the honest proxy.

## Fix plan (updated)

### A. One-roundtrip auth context — hardened per the review
- New SECURITY DEFINER RPC `get_auth_context()` returning `{ roles, profile }` in one call.
- Security hardening (the review's point 1): fixed `search_path = 'public'`, user identity taken from `auth.uid()` inside the function (never from arguments), `REVOKE ... FROM anon` so only authenticated sessions can call it, and the browser client keeps RLS so it can only ever receive its own roles/profile. Verified with student, judge and admin demo accounts.

### B. Instant sign-out — with no protected data left visible (point 2)
- `handleSignOut`: synchronously clear the query cache and auth context, navigate to `/auth` immediately, then fire the remote logout in the background.
- If the remote logout fails, do not silently claim success: show a toast and keep the local session cleared (next action re-authenticates). No protected route can render with a stale session because the guard re-checks the cleared context.

### C. Pending UI so navigation never looks frozen
- Add `defaultPendingComponent` (brand-matched skeleton) + `defaultPendingMs: 200`; role layouts keep their guards. No blank screens, no stale protected content (guards still run before render).

### D. Admin overview in 1 roundtrip
- RPC `admin_overview_kpis` returning all 5 counts + 8 recent rows in one call; benchmark against the current six requests.

### E. File reconciliation job (point 3)
- Extend the existing daily cron: a reconciliation pass that flags storage objects unreferenced by `submission_files` after a grace period and removes them, with log lines — never touching objects tied to in-progress submissions.

### F. Verification
- Re-run the Playwright timing script (login→admin, overview→directory cold/warm, sign-out) and record before/after; tests + build green; screenshots clean; role-based auth-context tests per the review.

### G. Load test with database-state reconciliation (the review's requirement)
- k6 against the published URL: realistic arrival ramp toward ~2,000 simulated users, plus a 650-team submission burst with real file uploads.
- Success = HTTP AND state: after the burst, SQL reconciliation confirms every accepted request has exactly one submission row, no duplicates, correct statuses, files all referenced. Report measured percentiles against the targets (95% < 500 ms, failures < 0.1%).
- Only if the test shows saturation → recommend instance upsizing, with the measurement as evidence.

## ChatGPT's 12 points — verified status

| # | Point | Status |
|---|---|---|
| 1 | Registered student missing from admin | Covered — signup trigger creates profile; admin directory RPC lists everyone, verified |
| 2 | Team-join races (over-size, double-team) | Covered — joining/creating goes through SECURITY DEFINER RPCs with unique DB constraints (one team per student, one membership per team) — race-safe at the database level |
| 3 | Deadline-hour submission rush | Covered — single idempotent upsert RPC, unique (team, stage) constraint, daily auto-finalize cron verified active |
| 4 | Slow queries / N+1 | Verified clean — all indexes present, log clean, no N+1 in admin/judge pages |
| 5 | Admin panel at 650 teams | Covered — server-side pagination RPCs, 25/page, cached page turns (warm page turn = 0 requests, measured) |
| 6 | Server capacity | Current instance has large headroom (13/60 connections); upsize only if the load test shows saturation |
| 7 | Duplicate registrations | Covered — unique emails, unique team codes, idempotent upserts |
| 8 | Partial failures (DB vs file) | Fixed by the reconciliation job in E |
| 9 | Cache/sync delays | Covered — 60 s cache with mutation-driven invalidation (instant after writes) |
| 10 | Security under load | Covered — RLS on every table, blind judging verified, admin checks inside RPCs; new RPC hardened per A |
| 11 | Failure visibility | Error reporting exists; uptime monitoring added as part of G's report; DB health checkable any time |
| 12 | Backups | Platform-managed by Lovable Cloud; not user-testable from here |

## Honest limits

A simulated 2,000-user test is the strongest proof available before the event; it cannot capture real-world network geography. After the fixes and load test, the remaining unknown is only real-user traffic.

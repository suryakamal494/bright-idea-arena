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

## ChatGPT's 12 points — verified status

| # | Point | Status |
|---|---|---|
| 1 | Registered student missing from admin | Covered — signup trigger creates profile; admin directory RPC lists everyone, verified |
| 2 | Team-join races (over-size, double-team) | Covered — joining/creating goes through SECURITY DEFINER RPCs with unique DB constraints (one team per student, one membership per team) — race-safe at the database level |
| 3 | Deadline-hour submission rush | Covered — single idempotent upsert RPC, unique (team, stage) constraint, daily auto-finalize cron verified active |
| 4 | Slow queries / N+1 | Verified clean — all indexes present, log clean, no N+1 in admin/judge pages |
| 5 | Admin panel at 650 teams | Covered — server-side pagination RPCs, 25/page, cached page turns (warm page turn = 0 requests, measured) |
| 6 | Server capacity | Current instance has large headroom (13/60 connections); can upsize in Backend → Advanced settings before event day if needed |
| 7 | Duplicate registrations | Covered — unique emails, unique team codes, idempotent upserts |
| 8 | Partial failures (DB vs file) | Minor residual: an uploaded file whose row insert fails leaves an orphan storage object — harmless, cleaned on retry |
| 9 | Cache/sync delays | Covered — 60 s cache with mutation-driven invalidation (instant after writes) |
| 10 | Security under load | Covered — RLS on every table, blind judging verified, admin checks inside RPCs |
| 11 | Failure visibility | Partially — error reporting exists; DB health monitorable; a separate uptime check is out of scope |
| 12 | Backups | Platform-managed by Lovable Cloud; not user-testable |

## Honest limits

I cannot prove 2,000-concurrent-user behaviour from here. After the fixes, a real load test against the published URL (k6: registration ramp + 650-team submission burst) is the remaining step — say the word and I'll set it up as a follow-up.

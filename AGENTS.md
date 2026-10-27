<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture decisions — Social Innovation Ideathon

- Backend is Lovable Cloud. All app-internal privileged logic lives in SECURITY DEFINER SQL RPCs (create_team, join_team, leave_team, disband_team, transfer_captaincy, upsert_submission, request_coordinator_role, revoke_parent_access) called from the browser client with RLS active. Do not reimplement these in TypeScript.
- No Supabase Edge Functions. If a server function is added, use createServerFn with requireSupabaseAuth and import supabaseAdmin only inside the handler after a has_role check.
- Student identity never reaches judge surfaces: judges read submissions by team_code only; profiles are never selected in judge routes.
- Routes are gated by role pathless layouts (_student, _admin, _judge, _coordinator) each with `ssr: false` and a beforeLoad role check via public.user_roles. There is no _authenticated layer.
- submission_files.url values beginning with `evidence/` are storage object paths (create signed URLs to view); anything else is an external URL.
- Admin listings at scale use SECURITY DEFINER RPCs (`admin_team_directory`, `admin_submission_directory`) that return `{ total, rows }` with server-side pagination and filtering; pages use TanStack Query with `keepPreviousData`, debounced search, and bounded page size. Never load unbounded tables in admin/judge routes.
- RPC optional args must be spread conditionally (`...(x ? { p_arg: x } : {})`) — `exactOptionalPropertyTypes` rejects explicit `undefined`, and `null` fails the generated types.
- Student submission autosave writes the RPC-returned row directly into the `["team-submissions", teamId]` cache instead of refetching; keep the flush-listener effect with a `[]` dependency array (per-render cleanup caused double saves).
- Submissions are structured form data (never uploaded filled-in documents): one-pager fields live in `submissions` columns; the printed one-pager is generated client-side from the row (`src/lib/onepager.ts`). A team's theme is its `teams.track` — the form displays it, never edits it.
- `MIN_TEAM_SIZE = 2`, `MAX_TEAM_SIZE = 3` (src/lib/team.ts) gate the submission form in the UI only when the roster query has succeeded with fewer members — a failed/short fetch must never lock a full team out; `upsert_submission` enforces the same rule server-side.
- Stage count lives in `competition_settings` (single row, `stage_count` 1|2) and is read by every stage-2 surface; `upsert_submission` rejects stage 2 when it is 1. Stage 2 additionally requires a published `results` row (stage 1, outcome shortlisted) for the team — enforced server-side, never just in UI. Unpublished `results` rows are invisible to non-admins via RLS; scores are never exposed to students, schools or coordinators, only published outcomes.
- Sign-in accepts email OR username: `profiles.username` is platform-unique (unique index, backfilled). Username resolution and the password grant happen server-side in `src/lib/auth-identifier.functions.ts` (the GoTrue token endpoint is called with the publishable key) — the resolved email never reaches the browser and the password check is never bypassed. Password reset accepts a username the same way.
- School bulk registration (`createStudentAccounts`): the school must supply username AND password per student (no auto-generation), student email is mandatory, unique platform-wide but unverified; school name comes from the coordinator profile, parent email is omitted. `checkBulkAvailability` pre-checks username/email collisions for inline errors; the signup trigger stores the username from metadata.
- Coordinator portal data comes from the school-scoped SECURITY DEFINER RPC `coordinator_school_overview` (teams, members, stage 1/2 statuses, published results only).
- Deadline policy: any team member may edit until the stage deadline, then the draft auto-finalises (finalize RPC + daily reconciliation job); after submit the roster and entry lock.
- Demo seed accounts share the password Ideathon2026! and must keep their @demo.in emails.
- Auth context and the admin overview are read via single-roundtrip SECURITY DEFINER RPCs (`get_auth_context`, `admin_overview_kpis`) instead of parallel client queries — every extra network roundtrip is amplified by user latency; keep the fallback two-query path in `src/lib/auth.ts` in case the RPC is unavailable.
- Sign-out navigates first and clears the query cache + auth context synchronously; the remote `signOut()` call runs in the background and failures surface as a toast, never a silent success.
- Unreferenced `evidence`-bucket objects are deleted daily by the HTTP cron schedule `reconcile-evidence-files` → `/api/public/cron/reconcile-files` (bearer-secret auth, 24h grace period); keep the grace period when editing.

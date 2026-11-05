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
- Clusters are team-level (`teams.cluster_id`); a coordinator-set school cluster is forced onto its students' teams. An empty `clusters` table is the off-switch (hides all cluster UI). `upsert_submission` rejects cluster-less teams; captains fix via `set_team_cluster`.
- `MIN_TEAM_SIZE = 2`, `MAX_TEAM_SIZE = 3` (src/lib/team.ts) gate the submission form in the UI only when the roster query has succeeded with fewer members — a failed/short fetch must never lock a full team out; `upsert_submission` enforces the same server-side.
- Stage count lives in `competition_settings` (single row, `stage_count` 1|2); stage 2 requires a published Round-1 shortlisted `results` row, enforced server-side. Unpublished results are invisible to non-admins via RLS; scores never reach students, schools or coordinators.
- Username sign-in resolves `profiles.auth_login_email` server-side, then verifies the password with Auth; it never returns the resolved address to the browser.
- School bulk registration (`createStudentAccounts`): school supplies username AND password per student; email mandatory, unique platform-wide, unverified; school name from the coordinator profile, no parent email; `checkBulkAvailability` pre-checks collisions; the signup trigger stores the username from metadata.
- Coordinator portal data comes from the school-scoped SECURITY DEFINER RPC `coordinator_school_overview` (teams, members, stage 1/2 statuses, published results only).
- Deadline policy: members may edit until the stage deadline; auto-finalisation (finalize RPC + daily job) submits only drafts passing `submission_complete_by_id` (title, stage answers, ≥1 attachment); incomplete drafts stay drafts with a missing-items message. Submit locks the roster and entry.
- Demo seed accounts share the password Ideathon2026! and must keep their @demo.in emails.
- Auth context and admin overview read via single-roundtrip SECURITY DEFINER RPCs (`get_auth_context`, `admin_overview_kpis`) — roundtrips × user latency hurt; keep the fallback two-query path in `src/lib/auth.ts` in case the RPC is unavailable.
- Judge queue is round-aware: Round 1 = stage-1 submissions, Round 2 = stage-2, filtered by the judge's track assignments; tabs hidden when stage_count is 1.
- Resource guide links point at hosted CDN PDFs (src/assets/*.asset.json pointers) until the official documents arrive — swap `announcements.link` then; never restore example.com placeholders.
- Sign-out navigates first and clears query cache + auth context synchronously; the remote `signOut()` runs in background; failures toast, never silent success.
- Unreferenced `evidence`-bucket objects are deleted daily by the HTTP cron schedule `reconcile-evidence-files` → `/api/public/cron/reconcile-files` (bearer-secret auth, 24h grace period); keep the grace period when editing.

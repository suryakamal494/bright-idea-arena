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
- `MIN_TEAM_SIZE = 3` (src/lib/team.ts) gates the submission form in the UI only when the roster query has succeeded with fewer members — a failed/short fetch must never lock a full team out; `upsert_submission` enforces the same rule server-side.
- Deadline policy: any team member may edit until the stage deadline, then the draft auto-finalises (finalize RPC + daily reconciliation job); after submit the roster and entry lock.
- Demo seed accounts share the password Ideathon2026! and must keep their @demo.in emails.

# Clusters — cluster-wise grouping with minimal database impact

## Goal

Teams get a cluster (Cluster 1–4 for this competition). Everything about the current workflow stays the same — clusters add identification and filtering only:

- Registrations, Submissions, Results admin pages each get a **Cluster column and Cluster filter**.
- School coordinators pick their school's cluster **before** registering students.
- Individual students pick the cluster at **team creation** (mandatory before submission).
- Round 1 shortlisting stays free-form: cluster is visibility only, no quotas.
- **No on/off toggle.** Clusters are active whenever at least one cluster exists; with an empty cluster list every cluster selector, column and filter disappears everywhere. That is the off-switch.

Decisions: seed placeholder clusters "Cluster 1"–"Cluster 4"; a school's cluster is **locked** for its students; no shortlist quotas.

## Database (one additive migration, nothing renamed or dropped)

1. **`clusters` table** — `id, name (unique), description, sort_order`. Same policy shape as themes: admins manage, everyone reads. Seed `Cluster 1`–`Cluster 4`.
2. **`teams.cluster_id`** — nullable reference to clusters, plus an index. Single source of truth for a team's cluster.
3. **`profiles.cluster_id`** — nullable reference to clusters; the school's cluster chosen by its coordinator (already owner-updatable through the existing "update own profile" rule).
4. **`create_team`** gains an optional cluster argument. When clusters exist: if the captain's school has a coordinator-set cluster, that cluster is forced (the choice is locked); otherwise the student's pick is required and validated.
5. **`upsert_submission`** rejects stage 1 and stage 2 submissions from a team without a cluster (when clusters exist) — the "mandatory before submission" rule enforced server-side, not just in the UI.
6. **New `set_team_cluster` RPC** — the captain of an existing cluster-less team picks the cluster; if the school has one set, it is applied automatically.
7. **Listing RPCs gain a cluster** — `admin_registration_directory`, `admin_team_directory`, `admin_submission_directory`, `admin_results_directory` each return a cluster name per row and accept a cluster filter; `coordinator_school_overview` returns the school cluster and each team's cluster.

## UI changes

1. **Deadlines & stages** — a "Clusters" card next to Themes: add, rename, delete (delete blocked while teams use it).
2. **Coordinator portal** — a cluster banner at the top: "Choose your school's cluster" before student entry works. Saved to the coordinator profile. Already-registered students are unaffected; the banner notes a change applies to future teams.
3. **Student team creation** — the cluster selector appears with the theme. For school-cluster students it renders as fixed text ("Your cluster: Cluster 2 — set by your school"), not a choice. Independent students must pick. The dashboard's existing-team view shows the cluster and a "select your cluster" prompt card for captains of cluster-less teams.
4. **Admin Registrations** — Cluster column + filter (cluster comes through the student's team; teamless students show "—").
5. **Admin Submissions** — Cluster column + filter on the round tabs and inspector.
6. **Admin Results** — Cluster column + filter on Round 1 / Round 2 tabs; per-cluster team counts stay visible for shortlisting.
7. Judge surfaces stay untouched.

## Edge cases handled

- Existing teams (including the four demo teams, which get assigned Cluster 1 in the migration) without a cluster: dashboard prompt for the captain; submissions blocked until set.
- Join-code members inherit the team's cluster — no cross-cluster conflicts possible.
- Cluster deletion blocked once any team uses it; renaming is safe (references by id).
- Coordinator changes the school cluster later: only future teams are affected; existing teams keep theirs.
- Empty cluster list hides all cluster UI — the natural off-switch, no per-portal logic.
- A student whose school has no coordinator (or a Google-signup student without a school) picks freely at team creation.

## Risks

- The listing RPC rewrites are the widest change; they keep the same signatures plus one optional filter argument, so existing pages keep working during the swap.
- No new auth surface: clusters follow the themes pattern, so RLS risk is minimal.

## Verification

- Typecheck, existing tests, and build.
- Playwright as demo admin: create a cluster, filter by cluster on Registrations / Submissions / Results.
- Playwright as demo captain: see the cluster prompt, set a cluster, confirm the submission gate and school-locked prefill.

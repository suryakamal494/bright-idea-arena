-- B1 fix + validation-gated auto-submit.

-- Shared check: does a stored submission meet the same requirements a manual
-- submit enforces (title, stage-specific answers, at least one attachment)?
create or replace function public.submission_complete_by_id(p_id uuid, p_stage integer)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v public.submissions;
begin
  select * into v from public.submissions where id = p_id;
  if not found then return false; end if;
  if coalesce(trim(v.title), '') = '' then return false; end if;
  if p_stage = 1 then
    if coalesce(trim(v.problem_statement), '') = ''
       or coalesce(trim(v.methodology), '') = '' then
      return false;
    end if;
  else
    if coalesce(trim(v.technical_reasoning), '') = ''
       or coalesce(trim(v.prototype_status), '') = ''
       or coalesce(trim(v.test_outcomes), '') = '' then
      return false;
    end if;
  end if;
  return exists (select 1 from public.submission_files f where f.submission_id = v.id);
end $$;

-- B1: the submit-only attachment check compared a uuid column with a text
-- value extracted from the payload (f.submission_id = p_payload->>'id'), which
-- made every final submit fail with "operator does not exist: uuid = text"
-- while autosaves (which skip that branch) succeeded. The check now keys off
-- the draft row's own id.
create or replace function public.upsert_submission(p_stage integer, p_payload jsonb, p_submit boolean default false)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare
  v_team public.teams;
  v_open boolean;
  v_deadline timestamptz;
  v_sub public.submissions;
  v_status text := 'draft';
  v_members int;
  v_bad_sutras int;
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student') then
    raise exception 'Only students can edit submissions';
  end if;
  select t.* into v_team from public.teams t
  join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  if not found then raise exception 'Create or join a team first'; end if;

  -- Cluster gate: every team must belong to a cluster while clusters exist.
  if exists (select 1 from public.clusters) and v_team.cluster_id is null then
    raise exception 'Your team has no cluster yet — set it on the team page first';
  end if;

  -- Team-size gate: the submission workspace opens only at 2+ members
  select count(*) into v_members from public.team_members m where m.team_id = v_team.id;
  if v_members < 2 then
    raise exception 'Your team needs at least 2 members before the submission form unlocks (%/2)', v_members;
  end if;

  select es.v_open, es.v_deadline into v_open, v_deadline
  from public.effective_stage_settings(v_team.track_id, p_stage) es;
  if v_open is distinct from true then raise exception 'This stage is closed'; end if;
  if v_deadline is not null and now() > v_deadline then raise exception 'The deadline for this stage has passed'; end if;

  -- Stage-count gate: a single-stage competition never accepts stage 2.
  if p_stage = 2
     and (select stage_count from public.competition_settings where id = 1) = 1 then
    raise exception 'This competition has a single stage';
  end if;
  -- Shortlist gate: stage 2 opens only for teams shortlisted after Round 1.
  if p_stage = 2 and not exists (
    select 1 from public.results r
    where r.team_id = v_team.id and r.stage = 1
      and r.outcome = 'shortlisted' and r.published
  ) then
    raise exception 'Stage 2 opens only for teams shortlisted after Round 1';
  end if;

  select * into v_sub from public.submissions where team_id = v_team.id and stage = p_stage;
  if found and v_sub.status = 'submitted' then raise exception 'This stage was already submitted for review'; end if;

  -- Validate Sutra ids against the reference list
  if p_payload ? 'sutra_ids' then
    select count(*) into v_bad_sutras
    from jsonb_array_elements_text(coalesce(p_payload->'sutra_ids', '[]'::jsonb)) as x(id)
    where not exists (select 1 from public.sutras s where s.id::text = x.id);
    if v_bad_sutras > 0 then raise exception 'One or more selected Sutras are not valid'; end if;
  end if;

  if p_submit then
    if coalesce(trim(p_payload->>'title'), '') = '' then raise exception 'Project title is required'; end if;
    if v_team.track_id is null then raise exception 'Your team has no theme selected — pick one on the team page first'; end if;
    if p_stage = 1 then
      if coalesce(trim(p_payload->>'problem_statement'), '') = '' then raise exception 'Problem statement is required'; end if;
      if coalesce(trim(p_payload->>'methodology'), '') = '' then raise exception 'Proposed solution is required'; end if;
    else
      if coalesce(trim(p_payload->>'technical_reasoning'), '') = '' then raise exception 'Technical reasoning is required'; end if;
      if coalesce(trim(p_payload->>'prototype_status'), '') = '' then raise exception 'Prototype status is required'; end if;
      if coalesce(trim(p_payload->>'test_outcomes'), '') = '' then raise exception 'Test outcomes are required'; end if;
    end if;
    -- Attachments are mandatory at submit; the draft row carries them.
    if not exists (
      select 1 from public.submission_files f where f.submission_id = v_sub.id
    ) then
      raise exception 'Attach at least one file before submitting';
    end if;
    v_status := 'submitted';
  end if;

  insert into public.submissions (
    team_id, stage, status, title, sdg_tags, problem_statement, methodology, links,
    technical_reasoning, prototype_status, test_outcomes, evidence_links,
    sutra_ids, sutras_explanation, submitted_at, updated_at, team_code
  ) values (
    v_team.id, p_stage, v_status,
    nullif(p_payload->>'title', ''),
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(coalesce(p_payload->'sdg_tags', '[]'::jsonb)) as x),
    nullif(p_payload->>'problem_statement', ''),
    nullif(p_payload->>'methodology', ''),
    nullif(p_payload->>'links', ''),
    nullif(p_payload->>'technical_reasoning', ''),
    nullif(p_payload->>'prototype_status', ''),
    nullif(p_payload->>'test_outcomes', ''),
    nullif(p_payload->>'evidence_links', ''),
    (select coalesce(array_agg(x::uuid), '{}') from jsonb_array_elements_text(coalesce(p_payload->'sutra_ids', '[]'::jsonb)) as x),
    nullif(p_payload->>'sutras_explanation', ''),
    case when p_submit then now() end,
    now(),
    v_team.team_code
  )
  on conflict (team_id, stage) do update set
    status = excluded.status,
    title = excluded.title,
    sdg_tags = excluded.sdg_tags,
    problem_statement = excluded.problem_statement,
    methodology = excluded.methodology,
    links = excluded.links,
    technical_reasoning = excluded.technical_reasoning,
    prototype_status = excluded.prototype_status,
    test_outcomes = excluded.test_outcomes,
    evidence_links = excluded.evidence_links,
    sutra_ids = excluded.sutra_ids,
    sutras_explanation = excluded.sutras_explanation,
    submitted_at = excluded.submitted_at,
    updated_at = now(),
    team_code = excluded.team_code
  returning * into v_sub;
  if p_submit and p_stage = 1 then
    update public.teams set locked = true where id = v_team.id;
  end if;
  return v_sub;
end $$;
grant execute on function public.upsert_submission(integer, jsonb, boolean) to authenticated;

-- Deadline finaliser: same boolean contract as before (true = finalised now),
-- but only submits drafts that meet the full submit requirements. Incomplete
-- drafts stay drafts; the form tells the student what is missing.
create or replace function public.finalize_due_submission(p_stage integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_deadline timestamptz;
  v_open boolean;
  v_finalized int := 0;
begin
  select t.id into v_team_id
  from public.teams t join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  if v_team_id is null then return false; end if;
  select es.v_open, es.v_deadline into v_open, v_deadline
  from public.effective_stage_settings((select track_id from public.teams where id = v_team_id), p_stage) es;
  if v_deadline is null or now() <= v_deadline then return false; end if;
  with upd as (
    update public.submissions s
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where s.team_id = v_team_id and s.stage = p_stage and s.status = 'draft'
      and public.submission_complete_by_id(s.id, p_stage)
    returning 1
  )
  select count(*) into v_finalized from upd;
  if v_finalized > 0 and p_stage = 1 then
    update public.teams set locked = true where id = v_team_id and locked = false;
  end if;
  return v_finalized > 0;
end
$$;
grant execute on function public.finalize_due_submission(integer) to authenticated;

-- Daily job: same completeness gate as the member-triggered finaliser.
create or replace function public.auto_submit_due_submissions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  with due as (
    select s.id, s.stage, t.id as team_id
    from public.submissions s
    join public.teams t on t.id = s.team_id
    cross join lateral public.effective_stage_settings(t.track_id, s.stage) es
    where s.status = 'draft'
      and es.v_deadline is not null
      and now() > es.v_deadline
      and public.submission_complete_by_id(s.id, s.stage)
  ), upd as (
    update public.submissions s
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where s.id in (select id from due)
    returning s.id, s.stage, s.team_id
  )
  select count(*) into v_count from upd;
  update public.teams t set locked = true
  where t.locked = false
    and exists (
      select 1 from public.submissions s
      join public.teams t2 on t2.id = s.team_id
      cross join lateral public.effective_stage_settings(t2.track_id, s.stage) es
      where s.team_id = t.id and s.stage = 1 and s.status = 'submitted'
        and es.v_deadline is not null and now() > es.v_deadline
    );
  return v_count;
end
$$;
grant execute on function public.auto_submit_due_submissions() to service_role;
grant execute on function public.auto_submit_due_submissions() to authenticated;
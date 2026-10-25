create or replace function public.join_team(p_code text)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.teams;
  v_count int;
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student') then
    raise exception 'Only students can join a team';
  end if;
  if exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'You are already in a team';
  end if;
  select * into t from public.teams where join_code = trim(p_code);
  if not found then raise exception 'Invalid join code'; end if;
  if t.locked then raise exception 'This team roster is locked'; end if;
  select count(*) into v_count from public.team_members where team_id = t.id;
  if v_count >= 3 then raise exception 'Team is full (maximum 3 members)'; end if;
  insert into public.team_members (team_id, user_id, is_captain) values (t.id, auth.uid(), false);
  return t;
end
$$;

create or replace function public.upsert_submission(p_stage integer, p_payload jsonb, p_submit boolean default false)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
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

  -- Team-size gate: the submission workspace opens only at 2+ members
  select count(*) into v_members from public.team_members m where m.team_id = v_team.id;
  if v_members < 2 then
    raise exception 'Your team needs at least 2 members before the submission form unlocks (%/2)', v_members;
  end if;

  select es.v_open, es.v_deadline into v_open, v_deadline
  from public.effective_stage_settings(v_team.track_id, p_stage) es;
  if v_open is distinct from true then raise exception 'This stage is closed'; end if;
  if v_deadline is not null and now() > v_deadline then raise exception 'The deadline for this stage has passed'; end if;

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
    -- Attachments are mandatory at submit
    if not exists (
      select 1 from public.submission_files f
      where p_payload->>'id' is not null and f.submission_id = p_payload->>'id'
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
end
$$;
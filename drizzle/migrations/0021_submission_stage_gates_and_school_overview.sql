-- Signup trigger now stores the school-provided username.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, phone, grade, school_name, city, parent_email, designation, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(nullif(new.raw_user_meta_data->>'grade', ''), '')::int,
    nullif(new.raw_user_meta_data->>'school_name', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'parent_email', ''),
    nullif(new.raw_user_meta_data->>'designation', ''),
    nullif(new.raw_user_meta_data->>'username', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.parent_revocations (user_id) values (new.id);
  return new;
end $function$;

-- Stage 2 is rejected when the competition runs a single stage and only for
-- teams shortlisted after Round 1 (published results row).
CREATE OR REPLACE FUNCTION public.upsert_submission(p_stage integer, p_payload jsonb, p_submit boolean DEFAULT false)
 RETURNS submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- School-scoped coordinator overview: teams, members, stage statuses and
-- published results only (unpublished rows are never returned).
CREATE OR REPLACE FUNCTION public.coordinator_school_overview()
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_school text;
begin
  if not public.has_role(v_uid, 'coordinator') then
    raise exception 'Coordinators only';
  end if;
  select school_name into v_school from public.profiles where id = v_uid;
  if v_school is null then raise exception 'Your coordinator profile has no school set'; end if;
  if not public.is_school_coordinator(v_school) then
    raise exception 'Coordinators only';
  end if;

  return (
    select json_build_object(
      'teams', coalesce((
        select json_agg(row_to_json(x)) from (
          select t.id as team_id, t.team_code, t.name as team_name,
            (select coalesce(json_agg(json_build_object('full_name', p.full_name, 'grade', p.grade) order by m.created_at), '[]'::json)
               from public.team_members m
               join public.profiles p on p.id = m.user_id
              where m.team_id = t.id) as members,
            (select s.status from public.submissions s where s.team_id = t.id and s.stage = 1) as stage1_status,
            (select s.status from public.submissions s where s.team_id = t.id and s.stage = 2) as stage2_status,
            (select r.outcome::text from public.results r where r.team_id = t.id and r.stage = 1 and r.published limit 1) as stage1_result,
            (select r.outcome::text from public.results r where r.team_id = t.id and r.stage = 2 and r.published limit 1) as stage2_result
          from public.teams t
          where exists (
            select 1 from public.team_members m
            join public.profiles p on p.id = m.user_id
            where m.team_id = t.id and p.school_name = v_school
          )
          order by t.team_code nulls last
        ) x), '[]'::json),
      'students', coalesce((
        select json_agg(row_to_json(y)) from (
          select p.id, p.full_name, p.username, p.grade, p.email, p.phone,
                 tm.team_id, t.team_code
          from public.profiles p
          left join public.team_members tm on tm.user_id = p.id
          left join public.teams t on t.id = tm.team_id
          where p.school_name = v_school and p.id <> v_uid
          order by p.full_name asc
        ) y), '[]'::json)
    )
  );
end $function$;
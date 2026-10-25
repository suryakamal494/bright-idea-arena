-- Digital one-pager submission form (per Student_Project_One-Pager_Submission_Guide)
-- 1. Swarna Andhra Sutra reference list (10 official Padi Sutralu)
create table public.sutras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int not null default 0
);
grant select on public.sutras to authenticated;
grant all on public.sutras to service_role;
alter table public.sutras enable row level security;
create policy "Authenticated users can read sutras"
  on public.sutras for select to authenticated using (true);

insert into public.sutras (id, name, description, sort_order) values
  ('b0000000-0000-4000-8000-000000000001', 'Zero Poverty', 'Eradicating poverty in all its forms', 1),
  ('b0000000-0000-4000-8000-000000000002', 'Employment', 'Generating livelihoods and jobs for all', 2),
  ('b0000000-0000-4000-8000-000000000003', 'Skilling & Human Resources Development', 'Building skills and capabilities of people', 3),
  ('b0000000-0000-4000-8000-000000000004', 'Water Security', 'Safe, reliable and sustainable water for every household and farm', 4),
  ('b0000000-0000-4000-8000-000000000005', 'Farmer–Agri Tech', 'Raising farmer incomes through technology and better practices', 5),
  ('b0000000-0000-4000-8000-000000000006', 'Global Best Logistics', 'World-class, low-cost movement of goods', 6),
  ('b0000000-0000-4000-8000-000000000007', 'Cost Optimisation – Energy & Fuel', 'Cutting energy and fuel costs across homes and industry', 7),
  ('b0000000-0000-4000-8000-000000000008', 'Product Perfection', 'Zero-defect, high-quality products and services', 8),
  ('b0000000-0000-4000-8000-000000000009', 'Swachh Andhra', 'Clean villages, towns and cities everywhere', 9),
  ('b0000000-0000-4000-8000-00000000000a', 'Deep Tech in All Walks of Life', 'Advanced technology woven into daily life and every sector', 10);

-- 2. Submissions: Sutra linkage
alter table public.submissions add column sutra_ids uuid[];
alter table public.submissions add column sutras_explanation text;

-- 3. Attachments: editable title/caption per file
alter table public.submission_files add column title text;

-- 4. Rewrite upsert_submission: team-size gate, mandatory theme, Sutra fields,
--    mandatory attachment on submit
create or replace function public.upsert_submission(p_stage integer, p_payload jsonb, p_submit boolean DEFAULT false)
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

  -- Team-size gate: the submission workspace opens only at 3+ members
  select count(*) into v_members from public.team_members m where m.team_id = v_team.id;
  if v_members < 3 then
    raise exception 'Your team needs at least 3 members before the submission form unlocks (%/3)', v_members;
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
$function$;

-- 5. Deadline auto-submit: finalize any draft whose stage deadline has passed.
-- Called by pg_cron every 10 minutes, and opportunistically by the student page.
create or replace function public.auto_submit_due_submissions()
returns int
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

-- Member-triggered finalisation (any team member visiting after the deadline
-- finalises their own team's draft). No-op before the deadline.
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
begin
  select t.id into v_team_id
  from public.teams t join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  if v_team_id is null then return false; end if;
  select es.v_open, es.v_deadline into v_open, v_deadline
  from public.effective_stage_settings((select track_id from public.teams where id = v_team_id), p_stage) es;
  if v_deadline is null or now() <= v_deadline then return false; end if;
  update public.submissions
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where team_id = v_team_id and stage = p_stage and status = 'draft';
  if found and p_stage = 1 then
    update public.teams set locked = true where id = v_team_id and locked = false;
  end if;
  return found;
end
$$;
grant execute on function public.finalize_due_submission(integer) to authenticated;

-- 6. Admin submission directory: expose theme, Sutras and attachment count
create or replace function public.admin_submission_directory(
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 10,
  p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_stage integer DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 10), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_result json;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Admins only';
  end if;

  with base as (
    select s.id, s.team_code, s.title, s.stage, s.status, s.submitted_at, s.updated_at,
           s.sutra_ids, s.sutras_explanation,
           (select count(*) from public.submission_files f where f.submission_id = s.id) as attachment_count,
           t.name as team_name, t.track_id, tr.name as track_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select count(*) from public.team_members m where m.team_id = t.id) as member_count
    from public.submissions s
    join public.teams t on t.id = s.team_id
    left join public.tracks tr on tr.id = t.track_id
  ),
  filtered as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (p_stage is null or stage = p_stage)
      and (p_status is null or status = p_status)
      and (v_search is null or team_code ilike '%' || v_search || '%'
                        or coalesce(title, '') ilike '%' || v_search || '%'
                        or coalesce(school, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (select json_agg(row_to_json(x))
         from (select * from filtered
                order by updated_at desc
                offset v_off limit v_size) x),
      '[]'::json)
  )
  into v_result;

  return v_result;
end
$function$;

GRANT EXECUTE ON FUNCTION public.admin_submission_directory(integer, integer, text, uuid, integer, text) TO authenticated;
grant execute on function public.upsert_submission(integer, jsonb, boolean) to authenticated;
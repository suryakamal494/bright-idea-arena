-- Clusters: cluster-wise grouping for teams. Fully additive.

create table if not exists public.clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order integer not null default 0
);

insert into public.clusters (name, sort_order) values
  ('Cluster 1', 1), ('Cluster 2', 2), ('Cluster 3', 3), ('Cluster 4', 4)
on conflict (name) do nothing;

grant select on public.clusters to authenticated, anon;
grant insert, update, delete on public.clusters to authenticated;
grant all on public.clusters to service_role;

alter table public.clusters enable row level security;

create policy "Public clusters" on public.clusters
  for select to authenticated, anon using (true);
create policy "Admin manages clusters" on public.clusters
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

alter table public.teams add column if not exists cluster_id uuid references public.clusters(id) on delete set null;
create index if not exists idx_teams_cluster on public.teams(cluster_id);

alter table public.profiles add column if not exists cluster_id uuid references public.clusters(id) on delete set null;

-- Demo teams land in Cluster 1 so the demo personas keep working end to end.
update public.teams set cluster_id = (select id from public.clusters where name = 'Cluster 1')
where cluster_id is null
  and id in (
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000004'
  );

-- Theme management from the browser was missing its write grants.
grant insert, update, delete on public.tracks to authenticated;

-- create_team gains an optional cluster argument. When clusters exist:
-- a coordinator-set school cluster is forced; otherwise the student must pick.
drop function if exists public.create_team(text, uuid);
create or replace function public.create_team(p_name text, p_track_id uuid, p_cluster_id uuid default null)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
  v_join text;
  v_slug text;
  i int;
  v_school text;
  v_school_cluster uuid;
  v_cluster uuid;
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student') then
    raise exception 'Only students can create a team';
  end if;
  if exists (select 1 from public.team_members where user_id = auth.uid()) then
    raise exception 'You are already in a team';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Team name is required';
  end if;
  select slug into v_slug from public.tracks where id = p_track_id;
  if v_slug is null then raise exception 'Track not found'; end if;
  if exists (select 1 from public.clusters) then
    select school_name into v_school from public.profiles where id = auth.uid();
    select p.cluster_id into v_school_cluster
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.id and ur.role = 'coordinator'
      where p.school_name = v_school and p.cluster_id is not null
      limit 1;
    if v_school_cluster is not null then
      v_cluster := v_school_cluster;
    else
      if p_cluster_id is null or not exists (select 1 from public.clusters where id = p_cluster_id) then
        raise exception 'Choose your cluster before creating a team';
      end if;
      v_cluster := p_cluster_id;
    end if;
  end if;
  for i in 1..25 loop
    v_join := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.teams where join_code = v_join);
  end loop;
  insert into public.teams (name, join_code, track_id, captain_id, team_code, cluster_id)
  values (trim(p_name), v_join, p_track_id, auth.uid(), public.generate_team_code(v_slug), v_cluster)
  returning * into t;
  insert into public.team_members (team_id, user_id, is_captain) values (t.id, auth.uid(), true);
  return t;
end $$;
grant execute on function public.create_team(text, uuid, uuid) to authenticated;

-- Captain of an existing cluster-less team picks the cluster; a school cluster wins.
create or replace function public.set_team_cluster(p_cluster_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_school text;
  v_school_cluster uuid;
begin
  if not exists (select 1 from public.clusters) then
    raise exception 'Clusters are not configured';
  end if;
  select t.id into v_team_id
    from public.teams t join public.team_members m on m.team_id = t.id
    where m.user_id = auth.uid() and m.is_captain;
  if not found then raise exception 'Only the captain can set the team cluster'; end if;
  select school_name into v_school from public.profiles where id = auth.uid();
  select p.cluster_id into v_school_cluster
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role = 'coordinator'
    where p.school_name = v_school and p.cluster_id is not null
    limit 1;
  if v_school_cluster is not null then
    p_cluster_id := v_school_cluster;
  end if;
  if not exists (select 1 from public.clusters where id = p_cluster_id) then
    raise exception 'Choose a valid cluster';
  end if;
  update public.teams set cluster_id = p_cluster_id where id = v_team_id;
end $$;
grant execute on function public.set_team_cluster(uuid) to authenticated;

-- Cluster gate: submissions require a cluster while clusters exist.
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
end $$;
grant execute on function public.upsert_submission(integer, jsonb, boolean) to authenticated;

-- Auth context gains the school's cluster so the team form can show a locked choice.
create or replace function public.get_auth_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'roles',
    coalesce(
      (select array_agg(r.role::text)
       from public.user_roles r
       where r.user_id = auth.uid()),
      '{}'::text[]
    ),
    'profile',
    (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'school_cluster', (
      select jsonb_build_object('id', cp.cluster_id, 'name', c.name)
      from public.profiles cp
      join public.user_roles ur on ur.user_id = cp.id and ur.role = 'coordinator'
      left join public.clusters c on c.id = cp.cluster_id
      where cp.school_name = (select school_name from public.profiles where id = auth.uid())
      limit 1
    )
  )
$$;

-- Coordinator overview gains the school cluster and each team's cluster.
create or replace function public.coordinator_school_overview()
returns json
language plpgsql
stable
security definer
set search_path = 'public'
as $$
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
      'cluster', (
        select json_build_object('id', p.cluster_id, 'name', c.name)
        from public.profiles p
        left join public.clusters c on c.id = p.cluster_id
        where p.id = v_uid
      ),
      'teams', coalesce((
        select json_agg(row_to_json(x)) from (
          select t.id as team_id, t.team_code, t.name as team_name, t.cluster_id, c.name as cluster_name,
            (select coalesce(json_agg(json_build_object('full_name', p.full_name, 'grade', p.grade) order by m.created_at), '[]'::json)
               from public.team_members m
               join public.profiles p on p.id = m.user_id
              where m.team_id = t.id) as members,
            (select s.status from public.submissions s where s.team_id = t.id and s.stage = 1) as stage1_status,
            (select s.status from public.submissions s where s.team_id = t.id and s.stage = 2) as stage2_status,
            (select r.outcome::text from public.results r where r.team_id = t.id and r.stage = 1 and r.published limit 1) as stage1_result,
            (select r.outcome::text from public.results r where r.team_id = t.id and r.stage = 2 and r.published limit 1) as stage2_result
          from public.teams t
          left join public.clusters c on c.id = t.cluster_id
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
end $$;

-- Registrations directory gains cluster name and filter.
drop function if exists public.admin_registration_directory(integer, integer, text, integer, text);
create or replace function public.admin_registration_directory(p_page integer default 0, p_page_size integer default 25, p_search text default null, p_grade integer default null, p_school text default null, p_cluster_id uuid default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_result json;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Admins only';
  end if;

  with base as (
    select p.id, p.full_name, p.email, p.phone, p.grade, p.school_name, p.city,
           p.parent_email, p.created_at,
           tm.team_id, t.team_code, t.name as team_name,
           t.cluster_id, c.name as cluster_name
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role = 'student'
    left join public.team_members tm on tm.user_id = p.id
    left join public.teams t on t.id = tm.team_id
    left join public.clusters c on c.id = t.cluster_id
  ),
  filtered as (
    select * from base
    where (p_grade is null or grade = p_grade)
      and (p_school is null or school_name = p_school)
      and (p_cluster_id is null or cluster_id = p_cluster_id)
      and (
        v_search is null
        or full_name ilike '%' || v_search || '%'
        or email ilike '%' || v_search || '%'
        or coalesce(phone, '') ilike '%' || v_search || '%'
        or coalesce(school_name, '') ilike '%' || v_search || '%'
        or coalesce(parent_email, '') ilike '%' || v_search || '%'
        or coalesce(city, '') ilike '%' || v_search || '%'
        or coalesce(team_code, '') ilike '%' || v_search || '%'
        or coalesce(team_name, '') ilike '%' || v_search || '%'
        or coalesce(cluster_name, '') ilike '%' || v_search || '%'
      )
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (select json_agg(row_to_json(x))
         from (select * from filtered
                order by created_at desc nulls last, full_name asc
                offset v_off limit v_size) x),
      '[]'::json)
  )
  into v_result;

  return v_result;
end
$$;
grant execute on function public.admin_registration_directory(integer, integer, text, integer, text, uuid) to authenticated, service_role;

-- Team directory gains cluster name and filter.
drop function if exists public.admin_team_directory(integer, integer, text, uuid, text, text, integer);
create or replace function public.admin_team_directory(p_page integer default 0, p_page_size integer default 25, p_search text default null, p_track_id uuid default null, p_status text default 'all', p_review text default 'all', p_stage integer default 1, p_cluster_id uuid default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_stage int := case when p_stage = 2 then 2 else 1 end;
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  with base as (
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id, tr.name as track_name,
           t.cluster_id, c.name as cluster_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select coalesce(json_agg(p2.full_name order by m2.created_at), '[]'::json)
              from public.team_members m2 join public.profiles p2 on p2.id = m2.user_id where m2.team_id = t.id) as members,
           (select count(*) from public.team_members m3 where m3.team_id = t.id) as member_count,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 1) as s1_status,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 2) as s2_status,
           (select max(s.updated_at) from public.submissions s where s.team_id = t.id and s.stage = v_stage) as last_activity,
           coalesce(rv.status, 'unreviewed') as review_status, rv.notes as review_notes,
           exists (select 1 from public.team_members m4 join public.profiles p4 on p4.id = m4.user_id
             where m4.team_id = t.id and v_search is not null and p4.full_name ilike '%' || v_search || '%') as member_hit
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.clusters c on c.id = t.cluster_id
    left join public.team_reviews rv on rv.team_id = t.id and rv.stage = v_stage
    where v_stage = 1 or exists (select 1 from public.results r1 where r1.team_id = t.id and r1.stage = 1
                                 and r1.outcome = 'shortlisted' and r1.published)
  ),
  pre as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (p_cluster_id is null or cluster_id = p_cluster_id)
      and (v_search is null or team_code ilike '%' || v_search || '%' or team_name ilike '%' || v_search || '%'
           or coalesce(school, '') ilike '%' || v_search || '%' or member_hit
           or coalesce(cluster_name, '') ilike '%' || v_search || '%')
      and (p_status = 'all'
        or (p_status = 'stage1' and s1_status = 'submitted')
        or (p_status = 'stage2' and s2_status = 'submitted')
        or (p_status = 'none' and (case when v_stage = 2 then s2_status else s1_status end) is null))
  ),
  filtered as (select * from pre where coalesce(p_review, 'all') = 'all' or review_status = p_review)
  select json_build_object(
    'total', (select count(*) from filtered),
    'counts', (select json_build_object('all', count(*),
        'marked', count(*) filter (where review_status = 'marked'),
        'unreviewed', count(*) filter (where review_status = 'unreviewed'),
        'not_selected', count(*) filter (where review_status = 'not_selected')) from pre),
    'rows', coalesce((select json_agg(row_to_json(x)) from (
        select team_id, team_code, team_name, track_id, track_name, cluster_id, cluster_name, school, members, member_count,
               s1_status, s2_status, last_activity, review_status, review_notes
        from filtered order by last_activity desc nulls last, team_name asc offset v_off limit v_size) x), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.admin_team_directory(integer, integer, text, uuid, text, text, integer, uuid) to authenticated, service_role;

-- Submissions directory gains cluster name and filter.
drop function if exists public.admin_submission_directory(integer, integer, text, uuid, integer, text);
create or replace function public.admin_submission_directory(p_page integer default 0, p_page_size integer default 10, p_search text default null, p_track_id uuid default null, p_stage integer default null, p_status text default null, p_cluster_id uuid default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
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
           t.cluster_id, c.name as cluster_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select count(*) from public.team_members m where m.team_id = t.id) as member_count
    from public.submissions s
    join public.teams t on t.id = s.team_id
    left join public.tracks tr on tr.id = t.track_id
    left join public.clusters c on c.id = t.cluster_id
  ),
  filtered as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (p_stage is null or stage = p_stage)
      and (p_status is null or status = p_status)
      and (p_cluster_id is null or cluster_id = p_cluster_id)
      and (v_search is null or team_code ilike '%' || v_search || '%'
                        or coalesce(title, '') ilike '%' || v_search || '%'
                        or coalesce(school, '') ilike '%' || v_search || '%'
                        or coalesce(cluster_name, '') ilike '%' || v_search || '%')
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
$$;
grant execute on function public.admin_submission_directory(integer, integer, text, uuid, integer, text, uuid) to authenticated, service_role;

-- Results directory gains cluster name and filter.
drop function if exists public.admin_results_directory(integer, integer, integer, text, uuid, text, text);
create or replace function public.admin_results_directory(p_stage integer default 1, p_page integer default 0, p_page_size integer default 50, p_search text default null, p_track_id uuid default null, p_outcome text default null, p_sort text default 'score', p_cluster_id uuid default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_stage int := case when p_stage = 2 then 2 else 1 end;
  v_max numeric := (select coalesce(sum(max_score), 0) from public.rubric_criteria);
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  with base as (
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id, tr.name as track_name,
           t.cluster_id, c.name as cluster_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           s.id as submission_id, s.title, coalesce(s.status, 'not_started') as status,
           r.outcome::text as outcome, coalesce(r.published, false) as published,
           sc.avg_score, coalesce(sc.reviews, 0) as reviews,
           coalesce(rv.status, 'unreviewed') as review_status
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.clusters c on c.id = t.cluster_id
    left join public.submissions s on s.team_id = t.id and s.stage = v_stage
    left join public.results r on r.team_id = t.id and r.stage = v_stage
    left join public.team_reviews rv on rv.team_id = t.id and rv.stage = v_stage
    left join lateral (
      select round(avg(tot), 1) as avg_score, count(*) as reviews from (
        select (select coalesce(sum((v)::numeric), 0) from jsonb_each_text(x.criterion_scores) as e(k, v)) as tot
        from public.scores x where x.submission_id = s.id and x.submitted) q
    ) sc on true
    where v_stage = 1 or exists (select 1 from public.results r1 where r1.team_id = t.id and r1.stage = 1 and r1.outcome = 'shortlisted')
  ),
  filtered as (
    select * from base b
    where (p_track_id is null or b.track_id = p_track_id)
      and (p_cluster_id is null or b.cluster_id = p_cluster_id)
      and (p_outcome is null or (p_outcome = 'none' and b.outcome is null)
           or (p_outcome = 'marked' and b.review_status = 'marked') or b.outcome = p_outcome)
      and (v_search is null or b.team_code ilike '%' || v_search || '%' or b.team_name ilike '%' || v_search || '%'
           or coalesce(b.title, '') ilike '%' || v_search || '%' or coalesce(b.school, '') ilike '%' || v_search || '%'
           or coalesce(b.cluster_name, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered), 'max_score', v_max,
    'counts', (select json_build_object('teams', count(*),
        'decided', count(*) filter (where outcome is not null),
        'positive', count(*) filter (where outcome in ('shortlisted','selected')),
        'marked', count(*) filter (where review_status = 'marked'),
        'published', bool_or(published)) from base),
    'rows', coalesce((select json_agg(row_to_json(f)) from (
        select * from filtered order by
          case when p_sort = 'score' then avg_score end desc nulls last,
          case when p_sort = 'team' then team_code end asc, team_code asc
        offset v_off limit v_size) f), '[]'::json)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.admin_results_directory(integer, integer, integer, text, uuid, text, text, uuid) to authenticated, service_role;

create type public.app_role as enum ('student', 'coordinator', 'judge', 'admin', 'mentor');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  grade int check (grade between 8 and 12),
  school_name text,
  city text,
  parent_email text,
  created_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  track_id uuid references public.tracks(id),
  captain_id uuid references public.profiles(id),
  locked boolean not null default false,
  team_code text unique,
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  is_captain boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, user_id),
  unique (user_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade not null,
  stage int not null check (stage in (1, 2)),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  title text,
  sdg_tags text[] default '{}',
  problem_statement text,
  methodology text,
  links text,
  technical_reasoning text,
  prototype_status text,
  test_outcomes text,
  evidence_links text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (team_id, stage)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade not null,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references public.tracks(id) on delete cascade,
  name text not null,
  description text,
  max_score numeric not null default 10 check (max_score > 0),
  sort_order int not null default 0
);

create table public.judge_assignments (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid references public.profiles(id) on delete cascade not null,
  track_id uuid references public.tracks(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (judge_id, track_id)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade not null,
  judge_id uuid references public.profiles(id) on delete cascade not null,
  criterion_scores jsonb not null default '{}'::jsonb,
  feedback text,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (submission_id, judge_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  kind text not null default 'announcement' check (kind in ('announcement', 'guide', 'webinar')),
  link text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.stage_settings (
  id uuid primary key default gen_random_uuid(),
  track_id uuid references public.tracks(id) on delete cascade,
  stage1_open boolean not null default true,
  stage1_deadline timestamptz,
  stage2_open boolean not null default false,
  stage2_deadline timestamptz,
  unique (track_id)
);

create table public.parent_revocations (
  token uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  restricted boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_school_coordinator(_school text)
returns boolean
language sql stable security definer set search_path = public as $$
  select _school is not null and exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = 'coordinator' and p.school_name = _school
  )
$$;

create or replace function public.is_team_member(_team_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members where team_id = _team_id and user_id = _user_id
  )
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone, grade, school_name, city, parent_email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(nullif(new.raw_user_meta_data->>'grade', ''), '')::int,
    nullif(new.raw_user_meta_data->>'school_name', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'parent_email', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.parent_revocations (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.generate_team_code(p_slug text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  for i in 1..25 loop
    c := 'TEAM-' || upper(replace(p_slug, '-', '')) || '-' || lpad((floor(random() * 900) + 100)::text, 3, '0');
    if not exists (select 1 from public.teams where team_code = c) then
      return c;
    end if;
  end loop;
  return 'TEAM-' || upper(replace(p_slug, '-', '')) || '-' || lpad((floor(random() * 900) + 100)::text, 3, '0');
end $$;

create or replace function public.create_team(p_name text, p_track_id uuid)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
  v_join text;
  v_slug text;
  i int;
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
  for i in 1..25 loop
    v_join := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.teams where join_code = v_join);
  end loop;
  insert into public.teams (name, join_code, track_id, captain_id, team_code)
  values (trim(p_name), v_join, p_track_id, auth.uid(), public.generate_team_code(v_slug))
  returning * into t;
  insert into public.team_members (team_id, user_id, is_captain) values (t.id, auth.uid(), true);
  return t;
end $$;

create or replace function public.join_team(p_code text)
returns public.teams
language plpgsql security definer set search_path = public as $$
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
  if v_count >= 5 then raise exception 'Team is full (maximum 5 members)'; end if;
  insert into public.team_members (team_id, user_id, is_captain) values (t.id, auth.uid(), false);
  return t;
end $$;

create or replace function public.leave_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_is_captain boolean;
  v_count int;
begin
  select m.is_captain into v_is_captain
  from public.team_members m where m.user_id = auth.uid();
  if not found then raise exception 'You are not in a team'; end if;
  select t.id into v_team_id
  from public.teams t join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  select count(*) into v_count from public.team_members where team_id = v_team_id;
  if v_is_captain and v_count > 1 then
    raise exception 'Captains must transfer captaincy or disband the team before leaving';
  end if;
  if v_is_captain then
    delete from public.teams where id = v_team_id;
  else
    delete from public.team_members where team_id = v_team_id and user_id = auth.uid();
  end if;
end $$;

create or replace function public.disband_team()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
begin
  select t.id into v_team_id from public.teams t
  join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid() and m.is_captain;
  if not found then raise exception 'Only the captain can disband the team'; end if;
  delete from public.teams where id = v_team_id;
end $$;

create or replace function public.transfer_captaincy(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_locked boolean;
begin
  select t.id, t.locked into v_team_id, v_locked from public.teams t
  join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid() and m.is_captain;
  if not found then raise exception 'Only the captain can transfer captaincy'; end if;
  if not public.is_team_member(v_team_id, p_user_id) or p_user_id = auth.uid() then
    raise exception 'Select a member of your team';
  end if;
  if v_locked then raise exception 'Roster is locked'; end if;
  update public.team_members set is_captain = false where team_id = v_team_id;
  update public.team_members set is_captain = true where team_id = v_team_id and user_id = p_user_id;
  update public.teams set captain_id = p_user_id where id = v_team_id;
end $$;

create or replace function public.effective_stage_settings(p_track_id uuid, p_stage int, out v_open boolean, out v_deadline timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  select coalesce(s.stage1_open, g.stage1_open), coalesce(s.stage1_deadline, g.stage1_deadline)
    into v_open, v_deadline
  from public.stage_settings g
  left join public.stage_settings s on s.track_id = p_track_id
  where g.track_id is null;
  if p_stage = 2 then
    select coalesce(s.stage2_open, g.stage2_open), coalesce(s.stage2_deadline, g.stage2_deadline)
      into v_open, v_deadline
    from public.stage_settings g
    left join public.stage_settings s on s.track_id = p_track_id
    where g.track_id is null;
  end if;
end $$;

create or replace function public.upsert_submission(p_stage int, p_payload jsonb, p_submit boolean default false)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare
  v_team public.teams;
  v_open boolean;
  v_deadline timestamptz;
  v_sub public.submissions;
  v_status text := 'draft';
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student') then
    raise exception 'Only students can edit submissions';
  end if;
  select t.* into v_team from public.teams t
  join public.team_members m on m.team_id = t.id
  where m.user_id = auth.uid();
  if not found then raise exception 'Create or join a team first'; end if;
  perform public.effective_stage_settings(v_team.track_id, p_stage, v_open, v_deadline);
  if v_open is distinct from true then raise exception 'This stage is closed'; end if;
  if v_deadline is not null and now() > v_deadline then raise exception 'The deadline for this stage has passed'; end if;
  select * into v_sub from public.submissions where team_id = v_team.id and stage = p_stage;
  if found and v_sub.status = 'submitted' then raise exception 'This stage was already submitted for review'; end if;
  if p_submit then
    if coalesce(trim(p_payload->>'title'), '') = '' then raise exception 'Project title is required'; end if;
    if p_stage = 1 then
      if coalesce(trim(p_payload->>'problem_statement'), '') = '' then raise exception 'Problem statement is required'; end if;
      if coalesce(trim(p_payload->>'methodology'), '') = '' then raise exception 'Methodology is required'; end if;
    else
      if coalesce(trim(p_payload->>'technical_reasoning'), '') = '' then raise exception 'Technical reasoning is required'; end if;
      if coalesce(trim(p_payload->>'prototype_status'), '') = '' then raise exception 'Prototype status is required'; end if;
      if coalesce(trim(p_payload->>'test_outcomes'), '') = '' then raise exception 'Test outcomes are required'; end if;
    end if;
    v_status := 'submitted';
  end if;
  insert into public.submissions (
    team_id, stage, status, title, sdg_tags, problem_statement, methodology, links,
    technical_reasoning, prototype_status, test_outcomes, evidence_links, submitted_at, updated_at
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
    case when p_submit then now() end,
    now()
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
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning * into v_sub;
  if p_submit and p_stage = 1 then
    update public.teams set locked = true where id = v_team.id;
  end if;
  return v_sub;
end $$;

create or replace function public.revoke_parent_access(p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.parent_revocations where token = p_token and restricted = false;
  if v_user is null then return false; end if;
  update auth.users set banned_until = 'infinity' where id = v_user;
  update public.parent_revocations set restricted = true where token = p_token;
  return true;
end $$;

create or replace function public.request_coordinator_role()
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role) values (auth.uid(), 'coordinator')
  on conflict (user_id, role) do nothing;
end $$;

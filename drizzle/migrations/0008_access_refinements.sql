alter table public.submissions add column team_code text;
update public.submissions set team_code = (select team_code from public.teams where teams.id = submissions.team_id);

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
    technical_reasoning, prototype_status, test_outcomes, evidence_links, submitted_at, updated_at, team_code
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
    submitted_at = excluded.submitted_at,
    updated_at = now(),
    team_code = excluded.team_code
  returning * into v_sub;
  if p_submit and p_stage = 1 then
    update public.teams set locked = true where id = v_team.id;
  end if;
  return v_sub;
end $$;

create policy "Teammates read profiles" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.team_members a
      join public.team_members b on a.team_id = b.team_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );

create policy "Judges read assigned teams" on public.teams
  for select to authenticated using (
    exists (
      select 1 from public.judge_assignments ja
      where ja.track_id = teams.track_id and ja.judge_id = auth.uid()
    )
  );

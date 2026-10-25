-- Break cross-table policy recursion (team_members <-> profiles <-> teams)
-- by moving coordinator checks into SECURITY DEFINER helpers.

create or replace function public.is_team_coordinator(_team_id uuid, _uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members m
    join public.profiles p on p.id = m.user_id
    where m.team_id = _team_id
      and p.school_name = (select school_name from public.profiles where id = _uid)
      and exists (
        select 1 from public.user_roles ur
        where ur.user_id = _uid and ur.role = 'coordinator'
      )
  )
$$;

drop policy if exists "Members and admins read team members" on public.team_members;
create policy "Members and admins read team members"
  on public.team_members for select to authenticated
  using (
    is_team_member(team_id, auth.uid())
    or has_role(auth.uid(), 'admin')
    or is_team_coordinator(team_id, auth.uid())
  );

drop policy if exists "Members and admins read teams" on public.teams;
create policy "Members and admins read teams"
  on public.teams for select to authenticated
  using (
    is_team_member(id, auth.uid())
    or has_role(auth.uid(), 'admin')
    or is_team_coordinator(id, auth.uid())
  );

drop policy if exists "Read submissions" on public.submissions;
create policy "Read submissions"
  on public.submissions for select to authenticated
  using (
    is_team_member(team_id, auth.uid())
    or has_role(auth.uid(), 'admin')
    or (status = 'submitted' and exists (
      select 1
      from public.teams t
      join public.judge_assignments ja on ja.track_id = t.track_id
      where t.id = submissions.team_id and ja.judge_id = auth.uid()
    ))
    or is_team_coordinator(team_id, auth.uid())
  );

drop policy if exists "Read submission files" on public.submission_files;
create policy "Read submission files"
  on public.submission_files for select to authenticated
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_files.submission_id
        and (
          is_team_member(s.team_id, auth.uid())
          or has_role(auth.uid(), 'admin')
          or (s.status = 'submitted' and exists (
            select 1
            from public.teams t
            join public.judge_assignments ja on ja.track_id = t.track_id
            where t.id = s.team_id and ja.judge_id = auth.uid()
          ))
          or is_team_coordinator(s.team_id, auth.uid())
        )
    )
  );

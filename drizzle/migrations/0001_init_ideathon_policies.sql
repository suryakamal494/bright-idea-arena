grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.tracks to authenticated, anon;
grant select on public.teams to authenticated;
grant select on public.team_members to authenticated;
grant select, insert, update on public.submissions to authenticated;
grant all on public.submissions to service_role;
grant select, insert, delete on public.submission_files to authenticated;
grant all on public.submission_files to service_role;
grant select on public.rubric_criteria to authenticated, anon;
grant select on public.judge_assignments to authenticated;
grant select, insert, update on public.scores to authenticated;
grant all on public.scores to service_role;
grant select, insert on public.announcements to authenticated;
grant all on public.announcements to service_role;
grant select, update on public.stage_settings to authenticated;
grant all on public.stage_settings to service_role;
grant select on public.parent_revocations to authenticated;
grant all on public.parent_revocations to service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_school_coordinator(text) to authenticated;
grant execute on function public.is_team_member(uuid, uuid) to authenticated;
grant execute on function public.create_team(text, uuid) to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.leave_team() to authenticated;
grant execute on function public.disband_team() to authenticated;
grant execute on function public.transfer_captaincy(uuid) to authenticated;
grant execute on function public.upsert_submission(int, jsonb, boolean) to authenticated;
grant execute on function public.request_coordinator_role() to authenticated;
grant execute on function public.revoke_parent_access(uuid) to anon, authenticated;

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.judge_assignments enable row level security;
alter table public.scores enable row level security;
alter table public.announcements enable row level security;
alter table public.stage_settings enable row level security;
alter table public.parent_revocations enable row level security;

create policy "Users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Own profile" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.is_school_coordinator(school_name)
  );
create policy "Update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Public tracks" on public.tracks for select to authenticated, anon using (true);
create policy "Admin manages tracks" on public.tracks for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Members and admins read teams" on public.teams for select to authenticated using (
  public.is_team_member(teams.id, auth.uid())
  or public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = teams.id and public.is_school_coordinator(p.school_name)
  )
);
create policy "Admins manage teams" on public.teams for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Members and admins read team members" on public.team_members for select to authenticated using (
  public.is_team_member(team_members.team_id, auth.uid())
  or public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.teams t join public.team_members m2 on m2.team_id = t.id
    join public.profiles p on p.id = m2.user_id
    where t.id = team_members.team_id and public.is_school_coordinator(p.school_name)
  )
);
create policy "Admins manage team members" on public.team_members for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Read submissions" on public.submissions for select to authenticated using (
  public.is_team_member(submissions.team_id, auth.uid())
  or public.has_role(auth.uid(), 'admin')
  or (status = 'submitted' and exists (
    select 1 from public.teams t
    join public.judge_assignments ja on ja.track_id = t.track_id
    where t.id = submissions.team_id and ja.judge_id = auth.uid()
  ))
  or exists (
    select 1 from public.teams t join public.team_members m on m.team_id = t.id
    join public.profiles p on p.id = m.user_id
    where t.id = submissions.team_id and public.is_school_coordinator(p.school_name)
  )
);
create policy "Members manage submissions" on public.submissions for insert to authenticated
  with check (public.is_team_member(submissions.team_id, auth.uid()));
create policy "Members update submissions" on public.submissions for update to authenticated
  using (public.is_team_member(submissions.team_id, auth.uid()))
  with check (public.is_team_member(submissions.team_id, auth.uid()));
create policy "Admins manage submissions" on public.submissions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Read submission files" on public.submission_files for select to authenticated using (
  exists (select 1 from public.submissions s where s.id = submission_files.submission_id and (
    public.is_team_member(s.team_id, auth.uid())
    or public.has_role(auth.uid(), 'admin')
    or (s.status = 'submitted' and exists (
      select 1 from public.teams t join public.judge_assignments ja on ja.track_id = t.track_id
      where t.id = s.team_id and ja.judge_id = auth.uid()
    ))
    or exists (
      select 1 from public.teams t join public.team_members m on m.team_id = t.id
      join public.profiles p on p.id = m.user_id
      where t.id = s.team_id and public.is_school_coordinator(p.school_name)
    )
  ))
);
create policy "Members add submission files" on public.submission_files for insert to authenticated
  with check (exists (select 1 from public.submissions s where s.id = submission_files.submission_id and public.is_team_member(s.team_id, auth.uid())));
create policy "Members remove submission files" on public.submission_files for delete to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_files.submission_id and public.is_team_member(s.team_id, auth.uid())));

create policy "Read rubric" on public.rubric_criteria for select to authenticated, anon using (true);
create policy "Admin manages rubric" on public.rubric_criteria for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Read own assignments" on public.judge_assignments for select to authenticated using (
  judge_assignments.judge_id = auth.uid() or public.has_role(auth.uid(), 'admin')
);
create policy "Admin manages assignments" on public.judge_assignments for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Read scores" on public.scores for select to authenticated using (
  scores.judge_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or exists (
    select 1 from public.submissions s join public.teams t on t.id = s.team_id
    join public.team_members m on m.team_id = t.id
    where s.id = scores.submission_id and m.user_id = auth.uid()
  )
);
create policy "Judges insert own scores" on public.scores for insert to authenticated
  with check (scores.judge_id = auth.uid() and exists (
    select 1 from public.submissions s join public.teams t on t.id = s.team_id
    join public.judge_assignments ja on ja.track_id = t.track_id and ja.judge_id = auth.uid()
    where s.id = scores.submission_id and s.status = 'submitted'
  ));
create policy "Judges update own scores" on public.scores for update to authenticated
  using (scores.judge_id = auth.uid())
  with check (scores.judge_id = auth.uid() and exists (
    select 1 from public.submissions s join public.teams t on t.id = s.team_id
    join public.judge_assignments ja on ja.track_id = t.track_id and ja.judge_id = auth.uid()
    where s.id = scores.submission_id and s.status = 'submitted'
  ));

create policy "Read announcements" on public.announcements for select to authenticated using (true);
create policy "Admin posts announcements" on public.announcements for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Read stage settings" on public.stage_settings for select to authenticated, anon using (true);
create policy "Admin manages stage settings" on public.stage_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins read revocations" on public.parent_revocations for select to authenticated
  using (parent_revocations.user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Members upload evidence" on storage.objects for insert to authenticated with check (
  bucket_id = 'evidence'
  and exists (
    select 1 from public.submissions s
    join public.team_members m on m.team_id = s.team_id and m.user_id = auth.uid()
    where (storage.foldername(name))[1] = s.team_id::text
  )
);
create policy "Read evidence" on storage.objects for select to authenticated using (
  bucket_id = 'evidence'
  and (
    exists (
      select 1 from public.submissions s
      join public.team_members m on m.team_id = s.team_id and m.user_id = auth.uid()
      where (storage.foldername(name))[1] = s.team_id::text
    )
    or public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.submissions s
      join public.teams t on t.id = s.team_id
      join public.judge_assignments ja on ja.track_id = t.track_id and ja.judge_id = auth.uid()
      where (storage.foldername(name))[1] = s.team_id::text and s.status = 'submitted'
    )
    or exists (
      select 1 from public.submissions s
      join public.teams t on t.id = s.team_id
      join public.team_members m on m.team_id = t.id
      join public.profiles p on p.id = m.user_id
      where (storage.foldername(name))[1] = s.team_id::text and public.is_school_coordinator(p.school_name)
    )
  )
);
create policy "Members delete evidence" on storage.objects for delete to authenticated using (
  bucket_id = 'evidence'
  and exists (
    select 1 from public.submissions s
    join public.team_members m on m.team_id = s.team_id and m.user_id = auth.uid()
    where (storage.foldername(name))[1] = s.team_id::text
  )
);

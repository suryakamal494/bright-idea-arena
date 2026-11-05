ALTER TABLE public.profiles ADD COLUMN auth_login_email text;

UPDATE public.profiles
SET auth_login_email = email
WHERE auth_login_email IS NULL;

CREATE UNIQUE INDEX profiles_username_lower_key
ON public.profiles (lower(username))
WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.auth_login_email IS 'Authentication credential address used for server-side sign-in and account recovery; may differ from the contact email in email.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_username text := nullif(lower(trim(coalesce(new.raw_user_meta_data->>'username', ''))), '');
  v_parent_email text := nullif(lower(trim(coalesce(new.raw_user_meta_data->>'parent_email', ''))), '');
  v_profile_email text := new.email;
  v_internal_identity boolean := lower(new.email) like '%@student.ideathon.local';
begin
  if v_internal_identity then
    if v_username is null or v_username !~ '^[a-z0-9._-]{3,30}$' then
      raise exception 'Choose a username with 3–30 letters, numbers, dots, underscores, or hyphens';
    end if;
    if v_parent_email is null or v_parent_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid parent or guardian email address';
    end if;
    v_profile_email := v_parent_email;
  end if;

  insert into public.profiles (id, full_name, email, phone, grade, school_name, city, parent_email, designation, username, auth_login_email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    v_profile_email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(nullif(new.raw_user_meta_data->>'grade', ''), '')::int,
    nullif(new.raw_user_meta_data->>'school_name', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    v_parent_email,
    nullif(new.raw_user_meta_data->>'designation', ''),
    v_username,
    new.email
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.parent_revocations (user_id) values (new.id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_overview_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'teams',    (select count(*) from public.teams),
    'students', (select count(*) from public.profiles p
                 where exists (select 1 from public.user_roles ur
                               where ur.user_id = p.id and ur.role = 'student')),
    'stage1',   (select count(*) from public.submissions where stage = 1 and status = 'submitted'),
    'stage2',   (select count(*) from public.submissions where stage = 2 and status = 'submitted'),
    'judged',   (
      select count(distinct sc.submission_id)
      from public.scores sc
      join public.submissions s on s.id = sc.submission_id
      where sc.submitted = true
        and s.status = 'submitted'
        and s.stage <= coalesce((select cs.stage_count from public.competition_settings cs where cs.id = 1), 1)
    ),
    'judging_total', (
      select count(*)
      from public.submissions s
      where s.status = 'submitted'
        and s.stage <= coalesce((select cs.stage_count from public.competition_settings cs where cs.id = 1), 1)
    ),
    'recent',   coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'team_code', s.team_code,
        'title', s.title,
        'stage', s.stage,
        'status', s.status,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'team_name', t.name,
        'track', tr.name
      ) order by s.updated_at desc)
      from (
        select * from public.submissions
        order by updated_at desc
        limit 8
      ) s
      left join public.teams t on t.id = s.team_id
      left join public.tracks tr on tr.id = t.track_id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

ALTER POLICY "Read evidence" ON storage.objects
USING (
  bucket_id = 'evidence'
  AND (
    EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.team_members m ON m.team_id = s.team_id AND m.user_id = auth.uid()
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
    )
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.teams t ON t.id = s.team_id
      JOIN public.judge_assignments ja ON ja.track_id = t.track_id AND ja.judge_id = auth.uid()
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
        AND s.status = 'submitted'
    )
    OR EXISTS (
      SELECT 1 FROM public.submissions s
      JOIN public.teams t ON t.id = s.team_id
      JOIN public.team_members m ON m.team_id = t.id
      JOIN public.profiles p ON p.id = m.user_id
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
        AND public.is_school_coordinator(p.school_name)
    )
  )
);
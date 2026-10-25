-- 0016: single-roundtrip auth context + admin overview KPIs

-- One call returns the caller's own roles and profile (identity taken from
-- auth.uid() inside the function, never from arguments).
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
    (select to_jsonb(p) from public.profiles p where p.id = auth.uid())
  )
$$;

revoke all on function public.get_auth_context() from anon, public;
grant execute on function public.get_auth_context() to authenticated;
grant execute on function public.get_auth_context() to service_role;

comment on function public.get_auth_context() is
  'Returns the caller''s own roles and profile in one roundtrip. Identity is derived from auth.uid(); anon has no execute grant.';

-- Admin-only: all overview counts plus the 8 most recent submissions in one call.
create or replace function public.admin_overview_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'teams',    (select count(*) from public.teams),
    'students', (select count(*) from public.profiles),
    'stage1',   (select count(*) from public.submissions where stage = 1 and status = 'submitted'),
    'stage2',   (select count(*) from public.submissions where stage = 2 and status = 'submitted'),
    'judged',   (select count(*) from public.scores where submitted = true),
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
$$;

revoke all on function public.admin_overview_kpis() from anon, public;
grant execute on function public.admin_overview_kpis() to authenticated;
grant execute on function public.admin_overview_kpis() to service_role;

comment on function public.admin_overview_kpis() is
  'Admin-only overview: five counts plus the eight most recent submissions in one roundtrip. Checked via has_role inside the function.';
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
$function$

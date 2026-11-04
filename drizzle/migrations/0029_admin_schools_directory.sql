create or replace function public.admin_schools_directory(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_cluster_id uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;

  with base as (
    select s.school_name,
      c.full_name as coordinator_name,
      c.phone as coordinator_phone,
      c.email as coordinator_email,
      c.city,
      cl.name as cluster_name,
      (select count(*) from public.profiles p
        where p.school_name = s.school_name
          and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'student')
          and not exists (select 1 from public.user_roles ur2 where ur2.user_id = p.id and ur2.role = 'coordinator')) as students,
      (select count(distinct t.id) from public.teams t
        join public.team_members m on m.team_id = t.id
        join public.profiles p on p.id = m.user_id
        where p.school_name = s.school_name) as teams,
      (select count(*) from public.teams t
        join public.team_members m on m.team_id = t.id
        join public.profiles p on p.id = m.user_id
        where p.school_name = s.school_name
          and exists (select 1 from public.submissions sub where sub.team_id = t.id and sub.stage = 1 and sub.status = 'submitted')) as stage1_submitted,
      (select count(*) from public.teams t
        join public.team_members m on m.team_id = t.id
        join public.profiles p on p.id = m.user_id
        where p.school_name = s.school_name
          and exists (select 1 from public.submissions sub where sub.team_id = t.id and sub.stage = 1)) as stage1_teams,
      (select count(*) from public.teams t
        join public.team_members m on m.team_id = t.id
        join public.profiles p on p.id = m.user_id
        where p.school_name = s.school_name
          and exists (select 1 from public.submissions sub where sub.team_id = t.id and sub.stage = 2 and sub.status = 'submitted')) as stage2_submitted,
      (select count(*) from public.teams t
        join public.team_members m on m.team_id = t.id
        join public.profiles p on p.id = m.user_id
        where p.school_name = s.school_name
          and exists (select 1 from public.submissions sub where sub.team_id = t.id and sub.stage = 2)) as stage2_teams
    from (select distinct school_name from public.profiles where school_name is not null) s
    left join lateral (
      select p.* from public.profiles p
      join public.user_roles ur on ur.user_id = p.id and ur.role = 'coordinator'
      where p.school_name = s.school_name
      order by p.created_at
      limit 1
    ) c on true
    left join public.clusters cl on cl.id = c.cluster_id
  ),
  filtered as (
    select * from base
    where (p_cluster_id is null or c.cluster_id = p_cluster_id)
      and (v_search is null
        or school_name ilike '%' || v_search || '%'
        or coalesce(city, '') ilike '%' || v_search || '%'
        or coalesce(coordinator_name, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'counts', (select json_build_object(
        'schools', count(*),
        'students', coalesce(sum(students), 0),
        'teams', coalesce(sum(teams), 0),
        'stage1_teams', coalesce(sum(stage1_teams), 0),
        'stage1_submitted', coalesce(sum(stage1_submitted), 0),
        'stage2_teams', coalesce(sum(stage2_teams), 0),
        'stage2_submitted', coalesce(sum(stage2_submitted), 0)) from base),
    'rows', coalesce(
      (select json_agg(row_to_json(x))
         from (select * from filtered
                order by students desc, school_name asc
                offset v_off limit v_size) x),
      '[]'::json)
  )
  into v_result;

  return v_result;
end
$function$;

grant execute on function public.admin_schools_directory(integer, integer, text, uuid) to authenticated;
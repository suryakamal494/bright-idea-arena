CREATE OR REPLACE FUNCTION public.admin_registration_directory(
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL,
  p_grade integer DEFAULT NULL,
  p_school text DEFAULT NULL,
  p_cluster_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    select p.id, p.full_name,
           case
             when p.auth_login_email like '%@student.ideathon.local' then p.parent_email
             else p.email
           end as email,
           p.phone, p.grade, p.school_name, p.city,
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
       from (
         select * from filtered
         order by created_at desc nulls last, full_name asc
         offset v_off limit v_size
       ) x),
      '[]'::json
    )
  ) into v_result;

  return v_result;
end;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_registration_directory(integer, integer, text, integer, text, uuid) TO authenticated, service_role;
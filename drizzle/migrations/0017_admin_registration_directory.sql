create or replace function public.admin_registration_directory(
  p_page integer default 0,
  p_page_size integer default 25,
  p_search text default null,
  p_grade integer default null,
  p_school text default null
)
returns json
language plpgsql
security definer
set search_path = public
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
           tm.team_id, t.team_code, t.name as team_name
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role = 'student'
    left join public.team_members tm on tm.user_id = p.id
    left join public.teams t on t.id = tm.team_id
  ),
  filtered as (
    select * from base
    where (p_grade is null or grade = p_grade)
      and (p_school is null or school_name = p_school)
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

revoke all on function public.admin_registration_directory(integer, integer, text, integer, text) from public, anon;
grant execute on function public.admin_registration_directory(integer, integer, text, integer, text) to authenticated, service_role;

create index if not exists profiles_school_name_idx on public.profiles (school_name);

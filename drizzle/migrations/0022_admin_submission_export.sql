create or replace function public.admin_submission_export(p_search text default null, p_track_id uuid default null, p_status text default 'all')
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  with t as (
    select t.id, t.team_code, t.name, tr.name as track_name,
      (select p.school_name from profiles p where p.id = t.captain_id) as school,
      (select s.status from submissions s where s.team_id = t.id and s.stage = 1) as s1,
      (select s.status from submissions s where s.team_id = t.id and s.stage = 2) as s2
    from teams t left join tracks tr on tr.id = t.track_id
    where (p_track_id is null or t.track_id = p_track_id)
  ), f as (
    select * from t where
      (p_status = 'all' or (p_status='stage1' and s1='submitted') or (p_status='stage2' and s2='submitted') or (p_status='none' and s1 is null))
      and (v_search is null or team_code ilike '%'||v_search||'%' or name ilike '%'||v_search||'%'
        or coalesce(school,'') ilike '%'||v_search||'%'
        or exists (select 1 from team_members m join profiles p on p.id=m.user_id where m.team_id=t.id and p.full_name ilike '%'||v_search||'%'))
  )
  select coalesce(json_agg(row_to_json(x)), '[]'::json) into v_result from (
    select coalesce(p.school_name, f.school) as school, p.full_name as student_name, p.email, p.phone,
      f.track_name as theme, f.team_code, f.name as team_name, f.s1 as stage1, f.s2 as stage2
    from f join team_members m on m.team_id = f.id join profiles p on p.id = m.user_id
    order by school nulls last, f.team_code, p.full_name limit 10000) x;
  return v_result;
end $$;
grant execute on function public.admin_submission_export(text, uuid, text) to authenticated;
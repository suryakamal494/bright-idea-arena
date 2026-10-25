-- Production-scale lookup indexes (no RLS or data changes)
CREATE INDEX IF NOT EXISTS submissions_status_stage_updated_idx ON public.submissions (status, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS submission_files_submission_idx ON public.submission_files (submission_id);
CREATE INDEX IF NOT EXISTS scores_judge_idx ON public.scores (judge_id);
CREATE INDEX IF NOT EXISTS teams_track_idx ON public.teams (track_id);
CREATE INDEX IF NOT EXISTS teams_captain_idx ON public.teams (captain_id);
CREATE INDEX IF NOT EXISTS profiles_school_idx ON public.profiles (school_name);
CREATE INDEX IF NOT EXISTS judge_assignments_track_idx ON public.judge_assignments (track_id);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS team_members_team_created_idx ON public.team_members (team_id, created_at);

-- Admin-only, single-roundtrip team directory (page + total in one call)
CREATE OR REPLACE FUNCTION public.admin_team_directory(
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_status text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id,
           tr.name as track_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select coalesce(json_agg(p2.full_name order by m2.created_at), '[]'::json)
              from public.team_members m2
              join public.profiles p2 on p2.id = m2.user_id
             where m2.team_id = t.id) as members,
           (select count(*) from public.team_members m3 where m3.team_id = t.id) as member_count,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 1) as s1_status,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 2) as s2_status,
           (select max(s.updated_at) from public.submissions s where s.team_id = t.id) as last_activity,
           exists (
             select 1 from public.team_members m4
             join public.profiles p4 on p4.id = m4.user_id
             where m4.team_id = t.id
               and v_search is not null
               and p4.full_name ilike '%' || v_search || '%'
           ) as member_hit
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
  ),
  filtered as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (v_search is null or team_code ilike '%' || v_search || '%'
                        or team_name ilike '%' || v_search || '%'
                        or coalesce(school, '') ilike '%' || v_search || '%'
                        or member_hit)
      and (
        p_status = 'all'
        or (p_status = 'stage1' and s1_status = 'submitted')
        or (p_status = 'stage2' and s2_status = 'submitted')
        or (p_status = 'none' and s1_status is null)
      )
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (select json_agg(row_to_json(x))
         from (select * from filtered
                order by last_activity desc nulls last, team_name asc
                offset v_off limit v_size) x),
      '[]'::json)
  )
  into v_result;

  return v_result;
end
$function$;

-- Admin-only, single-roundtrip submission directory (adds school + member count)
CREATE OR REPLACE FUNCTION public.admin_submission_directory(
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 10,
  p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_stage integer DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 10), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_result json;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Admins only';
  end if;

  with base as (
    select s.id, s.team_code, s.title, s.stage, s.status, s.submitted_at, s.updated_at,
           t.name as team_name, t.track_id, tr.name as track_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select count(*) from public.team_members m where m.team_id = t.id) as member_count
    from public.submissions s
    join public.teams t on t.id = s.team_id
    left join public.tracks tr on tr.id = t.track_id
  ),
  filtered as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (p_stage is null or stage = p_stage)
      and (p_status is null or status = p_status)
      and (v_search is null or team_code ilike '%' || v_search || '%'
                        or coalesce(title, '') ilike '%' || v_search || '%'
                        or coalesce(school, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(
      (select json_agg(row_to_json(x))
         from (select * from filtered
                order by updated_at desc
                offset v_off limit v_size) x),
      '[]'::json)
  )
  into v_result;

  return v_result;
end
$function$;

GRANT EXECUTE ON FUNCTION public.admin_team_directory(integer, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_submission_directory(integer, integer, text, uuid, integer, text) TO authenticated;

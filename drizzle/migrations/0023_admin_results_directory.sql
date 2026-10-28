CREATE OR REPLACE FUNCTION public.admin_results_directory(
  p_stage integer DEFAULT 1,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_sort text DEFAULT 'score'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_stage int := case when p_stage = 2 then 2 else 1 end;
  v_max numeric := (select coalesce(sum(max_score), 0) from public.rubric_criteria);
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only';
  end if;

  with base as (
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id, tr.name as track_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           s.id as submission_id, s.title, coalesce(s.status, 'not_started') as status,
           r.outcome::text as outcome, coalesce(r.published, false) as published,
           sc.avg_score, coalesce(sc.reviews, 0) as reviews
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.submissions s on s.team_id = t.id and s.stage = v_stage
    left join public.results r on r.team_id = t.id and r.stage = v_stage
    left join lateral (
      select round(avg(tot), 1) as avg_score, count(*) as reviews from (
        select (select coalesce(sum((v)::numeric), 0) from jsonb_each_text(x.criterion_scores) as e(k, v)) as tot
        from public.scores x where x.submission_id = s.id and x.submitted
      ) q
    ) sc on true
    where v_stage = 1 or exists (
      select 1 from public.results r1 where r1.team_id = t.id and r1.stage = 1 and r1.outcome = 'shortlisted'
    )
  ),
  filtered as (
    select * from base b
    where (p_track_id is null or b.track_id = p_track_id)
      and (p_outcome is null
           or (p_outcome = 'none' and b.outcome is null)
           or b.outcome = p_outcome)
      and (v_search is null
           or b.team_code ilike '%' || v_search || '%'
           or b.team_name ilike '%' || v_search || '%'
           or coalesce(b.title, '') ilike '%' || v_search || '%'
           or coalesce(b.school, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'max_score', v_max,
    'counts', (select json_build_object(
        'teams', count(*),
        'decided', count(*) filter (where outcome is not null),
        'positive', count(*) filter (where outcome in ('shortlisted','selected')),
        'published', bool_or(published)
      ) from base),
    'rows', coalesce((
      select json_agg(row_to_json(f)) from (
        select * from filtered
        order by
          case when p_sort = 'score' then avg_score end desc nulls last,
          case when p_sort = 'team' then team_code end asc,
          team_code asc
        offset v_off limit v_size
      ) f
    ), '[]'::json)
  ) into v_result;
  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_results_directory(integer, integer, integer, text, uuid, text, text) TO authenticated;
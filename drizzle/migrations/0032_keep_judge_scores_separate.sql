CREATE OR REPLACE FUNCTION public.admin_results_directory(
  p_stage integer DEFAULT 1,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_sort text DEFAULT 'score',
  p_cluster_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_stage int := case when p_stage = 2 then 2 else 1 end;
  v_max numeric := (select coalesce(sum(max_score), 0) from public.rubric_criteria);
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  with base as (
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id, tr.name as track_name,
           t.cluster_id, c.name as cluster_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           s.id as submission_id, s.title, coalesce(s.status, 'not_started') as status,
           r.outcome::text as outcome, coalesce(r.published, false) as published,
           coalesce(sc.judge_scores, '[]'::json) as judge_scores,
           coalesce(sc.reviews, 0) as reviews,
           sc.highest_score as score_order,
           coalesce(rv.status, 'unreviewed') as review_status
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.clusters c on c.id = t.cluster_id
    left join public.submissions s on s.team_id = t.id and s.stage = v_stage
    left join public.results r on r.team_id = t.id and r.stage = v_stage
    left join public.team_reviews rv on rv.team_id = t.id and rv.stage = v_stage
    left join lateral (
      select json_agg(json_build_object('judge_name', q.judge_name, 'score', q.total_score) order by q.judge_name) as judge_scores,
             count(*) as reviews,
             max(q.total_score) as highest_score
      from (
        select coalesce(p.full_name, 'Evaluator') as judge_name,
               (select coalesce(sum((v)::numeric), 0) from jsonb_each_text(x.criterion_scores) as e(k, v)) as total_score
        from public.scores x
        left join public.profiles p on p.id = x.judge_id
        where x.submission_id = s.id and x.submitted = true
      ) q
    ) sc on true
    where v_stage = 1 or exists (
      select 1 from public.results r1
      where r1.team_id = t.id and r1.stage = 1 and r1.outcome = 'shortlisted'
    )
  ),
  filtered as (
    select * from base b
    where (p_track_id is null or b.track_id = p_track_id)
      and (p_cluster_id is null or b.cluster_id = p_cluster_id)
      and (p_outcome is null or (p_outcome = 'none' and b.outcome is null)
           or (p_outcome = 'marked' and b.review_status = 'marked') or b.outcome = p_outcome)
      and (v_search is null or b.team_code ilike '%' || v_search || '%' or b.team_name ilike '%' || v_search || '%'
           or coalesce(b.title, '') ilike '%' || v_search || '%' or coalesce(b.school, '') ilike '%' || v_search || '%'
           or coalesce(b.cluster_name, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'max_score', v_max,
    'counts', (select json_build_object(
      'teams', count(*),
      'decided', count(*) filter (where outcome is not null),
      'positive', count(*) filter (where outcome in ('shortlisted', 'selected')),
      'marked', count(*) filter (where review_status = 'marked'),
      'published', bool_or(published)
    ) from base),
    'rows', coalesce((
      select json_agg(json_build_object(
        'team_id', f.team_id,
        'team_code', f.team_code,
        'team_name', f.team_name,
        'track_name', f.track_name,
        'cluster_name', f.cluster_name,
        'school', f.school,
        'title', f.title,
        'status', f.status,
        'outcome', f.outcome,
        'published', f.published,
        'judge_scores', f.judge_scores,
        'reviews', f.reviews,
        'review_status', f.review_status
      ))
      from (
        select * from filtered
        order by case when p_sort = 'score' then score_order end desc nulls last,
                 case when p_sort = 'team' then team_code end asc,
                 team_code asc
        offset v_off limit v_size
      ) f
    ), '[]'::json)
  ) into v_result;
  return v_result;
end;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_results_directory(integer, integer, integer, text, uuid, text, text, uuid) TO authenticated, service_role;
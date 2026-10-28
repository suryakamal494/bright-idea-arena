ALTER TABLE public.team_reviews ADD COLUMN stage integer NOT NULL DEFAULT 1 CHECK (stage IN (1,2));
ALTER TABLE public.team_reviews DROP CONSTRAINT team_reviews_pkey;
ALTER TABLE public.team_reviews ADD CONSTRAINT team_reviews_pkey PRIMARY KEY (team_id, stage);

DROP FUNCTION IF EXISTS public.admin_team_directory(integer, integer, text, uuid, text, text);
CREATE FUNCTION public.admin_team_directory(
  p_page integer DEFAULT 0, p_page_size integer DEFAULT 25, p_search text DEFAULT NULL,
  p_track_id uuid DEFAULT NULL, p_status text DEFAULT 'all', p_review text DEFAULT 'all', p_stage integer DEFAULT 1
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_off int := greatest(coalesce(p_page, 0), 0) * v_size;
  v_stage int := case when p_stage = 2 then 2 else 1 end;
  v_result json;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admins only'; end if;
  with base as (
    select t.id as team_id, t.team_code, t.name as team_name, t.track_id, tr.name as track_name,
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           (select coalesce(json_agg(p2.full_name order by m2.created_at), '[]'::json)
              from public.team_members m2 join public.profiles p2 on p2.id = m2.user_id where m2.team_id = t.id) as members,
           (select count(*) from public.team_members m3 where m3.team_id = t.id) as member_count,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 1) as s1_status,
           (select s.status from public.submissions s where s.team_id = t.id and s.stage = 2) as s2_status,
           (select max(s.updated_at) from public.submissions s where s.team_id = t.id and s.stage = v_stage) as last_activity,
           coalesce(rv.status, 'unreviewed') as review_status, rv.notes as review_notes,
           exists (select 1 from public.team_members m4 join public.profiles p4 on p4.id = m4.user_id
             where m4.team_id = t.id and v_search is not null and p4.full_name ilike '%' || v_search || '%') as member_hit
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.team_reviews rv on rv.team_id = t.id and rv.stage = v_stage
    where v_stage = 1 or exists (select 1 from public.results r1 where r1.team_id = t.id and r1.stage = 1
                                 and r1.outcome = 'shortlisted' and r1.published)
  ),
  pre as (
    select * from base
    where (p_track_id is null or track_id = p_track_id)
      and (v_search is null or team_code ilike '%' || v_search || '%' or team_name ilike '%' || v_search || '%'
           or coalesce(school, '') ilike '%' || v_search || '%' or member_hit)
      and (p_status = 'all'
        or (p_status = 'stage1' and s1_status = 'submitted')
        or (p_status = 'stage2' and s2_status = 'submitted')
        or (p_status = 'none' and (case when v_stage = 2 then s2_status else s1_status end) is null))
  ),
  filtered as (select * from pre where coalesce(p_review, 'all') = 'all' or review_status = p_review)
  select json_build_object(
    'total', (select count(*) from filtered),
    'counts', (select json_build_object('all', count(*),
        'marked', count(*) filter (where review_status = 'marked'),
        'unreviewed', count(*) filter (where review_status = 'unreviewed'),
        'not_selected', count(*) filter (where review_status = 'not_selected')) from pre),
    'rows', coalesce((select json_agg(row_to_json(x)) from (
        select team_id, team_code, team_name, track_id, track_name, school, members, member_count,
               s1_status, s2_status, last_activity, review_status, review_notes
        from filtered order by last_activity desc nulls last, team_name asc offset v_off limit v_size) x), '[]'::json)
  ) into v_result;
  return v_result;
end;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_team_directory(integer, integer, text, uuid, text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_results_directory(
  p_stage integer DEFAULT 1, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL, p_track_id uuid DEFAULT NULL, p_outcome text DEFAULT NULL, p_sort text DEFAULT 'score'
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
           (select p.school_name from public.profiles p where p.id = t.captain_id) as school,
           s.id as submission_id, s.title, coalesce(s.status, 'not_started') as status,
           r.outcome::text as outcome, coalesce(r.published, false) as published,
           sc.avg_score, coalesce(sc.reviews, 0) as reviews,
           coalesce(rv.status, 'unreviewed') as review_status
    from public.teams t
    left join public.tracks tr on tr.id = t.track_id
    left join public.submissions s on s.team_id = t.id and s.stage = v_stage
    left join public.results r on r.team_id = t.id and r.stage = v_stage
    left join public.team_reviews rv on rv.team_id = t.id and rv.stage = v_stage
    left join lateral (
      select round(avg(tot), 1) as avg_score, count(*) as reviews from (
        select (select coalesce(sum((v)::numeric), 0) from jsonb_each_text(x.criterion_scores) as e(k, v)) as tot
        from public.scores x where x.submission_id = s.id and x.submitted) q
    ) sc on true
    where v_stage = 1 or exists (select 1 from public.results r1 where r1.team_id = t.id and r1.stage = 1 and r1.outcome = 'shortlisted')
  ),
  filtered as (
    select * from base b
    where (p_track_id is null or b.track_id = p_track_id)
      and (p_outcome is null or (p_outcome = 'none' and b.outcome is null)
           or (p_outcome = 'marked' and b.review_status = 'marked') or b.outcome = p_outcome)
      and (v_search is null or b.team_code ilike '%' || v_search || '%' or b.team_name ilike '%' || v_search || '%'
           or coalesce(b.title, '') ilike '%' || v_search || '%' or coalesce(b.school, '') ilike '%' || v_search || '%')
  )
  select json_build_object(
    'total', (select count(*) from filtered), 'max_score', v_max,
    'counts', (select json_build_object('teams', count(*),
        'decided', count(*) filter (where outcome is not null),
        'positive', count(*) filter (where outcome in ('shortlisted','selected')),
        'marked', count(*) filter (where review_status = 'marked'),
        'published', bool_or(published)) from base),
    'rows', coalesce((select json_agg(row_to_json(f)) from (
        select * from filtered order by
          case when p_sort = 'score' then avg_score end desc nulls last,
          case when p_sort = 'team' then team_code end asc, team_code asc
        offset v_off limit v_size) f), '[]'::json)
  ) into v_result;
  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_auth_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'roles',
    coalesce(
      (select array_agg(r.role::text)
       from public.user_roles r
       where r.user_id = auth.uid()),
      '{}'::text[]
    ),
    'profile', (
      select to_jsonb(p) - 'auth_login_email'
      from public.profiles p
      where p.id = auth.uid()
    ),
    'school_cluster', (
      select jsonb_build_object('id', cp.cluster_id, 'name', c.name)
      from public.profiles cp
      join public.user_roles ur on ur.user_id = cp.id and ur.role = 'coordinator'
      left join public.clusters c on c.id = cp.cluster_id
      where cp.school_name = (select school_name from public.profiles where id = auth.uid())
      limit 1
    )
  )
$function$;
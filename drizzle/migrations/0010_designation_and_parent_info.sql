ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS designation text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, phone, grade, school_name, city, parent_email, designation)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(nullif(new.raw_user_meta_data->>'grade', ''), '')::int,
    nullif(new.raw_user_meta_data->>'school_name', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'parent_email', ''),
    nullif(new.raw_user_meta_data->>'designation', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.parent_revocations (user_id) values (new.id);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.parent_revoke_info(p_token uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'student_name', pf.full_name,
    'school_name', pf.school_name,
    'grade', pf.grade,
    'restricted', pr.restricted
  )
  FROM public.parent_revocations pr
  JOIN public.profiles pf ON pf.id = pr.user_id
  WHERE pr.token = p_token;
$function$;

CREATE OR REPLACE FUNCTION public.parent_notify_info()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'student_name', pf.full_name,
    'school_name', pf.school_name,
    'grade', pf.grade,
    'city', pf.city,
    'parent_email', pf.parent_email,
    'token', pr.token
  )
  FROM public.profiles pf
  JOIN public.parent_revocations pr ON pr.user_id = pf.id
  WHERE pf.id = auth.uid();
$function$;
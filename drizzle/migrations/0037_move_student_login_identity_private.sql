CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE private.student_login_identities (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  auth_email text NOT NULL UNIQUE
);
ALTER TABLE private.student_login_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.student_login_identities FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.student_login_identities (user_id, username, auth_email)
SELECT p.id, lower(trim(p.username)), coalesce(p.auth_login_email, p.email)
FROM public.profiles p
WHERE nullif(trim(p.username), '') IS NOT NULL
  AND coalesce(p.auth_login_email, p.email) IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET username = EXCLUDED.username,
    auth_email = EXCLUDED.auth_email;

UPDATE public.profiles SET auth_login_email = NULL WHERE auth_login_email IS NOT NULL;
COMMENT ON COLUMN public.profiles.auth_login_email IS 'DEPRECATED: authentication email identities are stored in the private student_login_identities schema and are never exposed through profile reads.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
declare
  v_username text := nullif(lower(trim(coalesce(new.raw_user_meta_data->>'username', ''))), '');
  v_parent_email text := nullif(lower(trim(coalesce(new.raw_user_meta_data->>'parent_email', ''))), '');
  v_profile_email text := new.email;
  v_internal_identity boolean := lower(new.email) like '%@student.ideathon.local';
begin
  if v_internal_identity then
    if v_username is null or v_username !~ '^[a-z0-9._-]{3,30}$' then
      raise exception 'Choose a username with 3–30 letters, numbers, dots, underscores, or hyphens';
    end if;
    if v_parent_email is null or v_parent_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'Enter a valid parent or guardian email address';
    end if;
    v_profile_email := v_parent_email;
  end if;

  insert into public.profiles (id, full_name, email, phone, grade, school_name, city, parent_email, designation, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    v_profile_email,
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(nullif(new.raw_user_meta_data->>'grade', ''), '')::int,
    nullif(new.raw_user_meta_data->>'school_name', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    v_parent_email,
    nullif(new.raw_user_meta_data->>'designation', ''),
    v_username
  );

  IF v_username IS NOT NULL THEN
    INSERT INTO private.student_login_identities (user_id, username, auth_email)
    VALUES (new.id, v_username, new.email);
  END IF;

  insert into public.user_roles (user_id, role) values (new.id, 'student');
  insert into public.parent_revocations (user_id) values (new.id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_student_login_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
declare
  v_auth_email text;
  v_username text := nullif(lower(trim(coalesce(new.username, ''))), '');
begin
  if v_username is null then
    delete from private.student_login_identities where user_id = new.id;
    return new;
  end if;

  select u.email into v_auth_email from auth.users u where u.id = new.id;
  if v_auth_email is not null then
    insert into private.student_login_identities (user_id, username, auth_email)
    values (new.id, v_username, v_auth_email)
    on conflict (user_id) do update
      set username = excluded.username,
          auth_email = excluded.auth_email;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS sync_student_login_identity ON public.profiles;
CREATE TRIGGER sync_student_login_identity
AFTER UPDATE OF username ON public.profiles
FOR EACH ROW
WHEN (OLD.username IS DISTINCT FROM NEW.username)
EXECUTE FUNCTION public.sync_student_login_identity();

CREATE OR REPLACE FUNCTION public.get_student_login_identity(p_username text)
RETURNS TABLE(auth_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT i.auth_email
  FROM private.student_login_identities i
  WHERE i.username = lower(trim(p_username))
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.get_student_login_identity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_login_identity(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_student_login_identity() TO service_role;
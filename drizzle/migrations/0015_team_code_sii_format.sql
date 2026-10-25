CREATE OR REPLACE FUNCTION public.generate_team_code(p_slug text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
declare
  c text;
  n int;
begin
  select coalesce(max((split_part(team_code, ' - ', 3))::int), 0) + 1
    into n
    from public.teams
    where team_code like 'Team - SII - %';
  for i in 0..25 loop
    c := 'Team - SII - ' || lpad((n + i)::text, 3, '0');
    if not exists (select 1 from public.teams where team_code = c) then
      return c;
    end if;
  end loop;
  return c;
end
$$;
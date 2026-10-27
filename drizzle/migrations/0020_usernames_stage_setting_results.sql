-- Platform-unique login handle: email or username both work at sign-in.
ALTER TABLE public.profiles ADD COLUMN username TEXT;
CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username) WHERE username IS NOT NULL;

-- Backfill: derive a unique username from each account email's local part.
DO $$
DECLARE r RECORD; v_base TEXT; v_u TEXT; i INT;
BEGIN
  FOR r IN SELECT id, email FROM public.profiles ORDER BY created_at LOOP
    v_base := lower(regexp_replace(split_part(coalesce(r.email, 'student'), '@', 1), '[^a-z0-9._-]', '', 'g'));
    IF v_base IS NULL OR v_base = '' THEN v_base := 'user'; END IF;
    v_u := v_base; i := 0;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_u) LOOP
      i := i + 1; v_u := v_base || i::TEXT;
    END LOOP;
    UPDATE public.profiles SET username = v_u WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON COLUMN public.profiles.username IS 'Platform-unique login handle; sign-in accepts email or username.';

-- Global competition configuration (single row).
CREATE TABLE public.competition_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stage_count INT NOT NULL DEFAULT 2 CHECK (stage_count IN (1, 2)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.competition_settings (id) VALUES (1);
GRANT SELECT ON public.competition_settings TO authenticated, anon;
GRANT ALL ON public.competition_settings TO service_role;
ALTER TABLE public.competition_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Competition settings readable" ON public.competition_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins update competition settings" ON public.competition_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Published outcomes only are visible to teams/coordinators; scores stay internal.
CREATE TYPE public.result_outcome AS ENUM ('shortlisted', 'not_selected', 'selected');
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stage INT NOT NULL,
  outcome public.result_outcome NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, stage)
);
CREATE INDEX results_team_stage_lookup ON public.results (team_id, stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;
GRANT ALL ON public.results TO service_role;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage results" ON public.results
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team members read published results" ON public.results
  FOR SELECT TO authenticated
  USING (published AND public.is_team_member(team_id, auth.uid()));
CREATE POLICY "School coordinators read published results" ON public.results
  FOR SELECT TO authenticated
  USING (published AND public.is_team_coordinator(team_id, auth.uid()));
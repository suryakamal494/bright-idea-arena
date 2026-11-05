ALTER POLICY "Read evidence" ON storage.objects
USING (
  bucket_id = 'evidence'
  AND (
    EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.team_members m ON m.team_id = s.team_id AND m.user_id = auth.uid()
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
    )
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.teams t ON t.id = s.team_id
      JOIN public.judge_assignments ja ON ja.track_id = t.track_id AND ja.judge_id = auth.uid()
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
        AND s.status = 'submitted'
    )
    OR EXISTS (
      SELECT 1
      FROM public.submissions s
      JOIN public.teams t ON t.id = s.team_id
      JOIN public.team_members m ON m.team_id = t.id
      JOIN public.profiles p ON p.id = m.user_id
      WHERE (storage.foldername(objects.name))[1] = s.team_id::text
        AND public.is_school_coordinator(p.school_name)
    )
  )
);
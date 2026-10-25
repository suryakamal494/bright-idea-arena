insert into public.tracks (id, name, slug, description) values
  ('10000000-0000-4000-8000-000000000001', 'AgriTech', 'agritech', 'Innovations for farming, food systems and rural livelihoods'),
  ('10000000-0000-4000-8000-000000000002', 'CleanTech', 'cleantech', 'Clean energy, waste management and climate solutions'),
  ('10000000-0000-4000-8000-000000000003', 'Health', 'health', 'Community health, sanitation and wellbeing innovations'),
  ('10000000-0000-4000-8000-000000000004', 'Education', 'education', 'Learning access, tools and inclusive education');

insert into public.rubric_criteria (id, name, description, max_score, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', 'Innovation & Creativity', 'Originality of the idea and freshness of the approach', 10, 1),
  ('c0000000-0000-4000-8000-000000000002', 'Problem Understanding', 'Depth of research and clarity of the problem statement', 10, 2),
  ('c0000000-0000-4000-8000-000000000003', 'Feasibility & Technical Soundness', 'Realistic methodology, technical reasoning and prototype progress', 10, 3),
  ('c0000000-0000-4000-8000-000000000004', 'Social Impact', 'Scale and depth of benefit to the target community', 10, 4),
  ('c0000000-0000-4000-8000-000000000005', 'Presentation & Clarity', 'Quality of documentation, evidence and communication', 10, 5);

insert into public.stage_settings (id, track_id, stage1_open, stage1_deadline, stage2_open, stage2_deadline) values
  ('e0000000-0000-4000-8000-000000000001', null, true, now() + interval '14 days', true, now() + interval '35 days');

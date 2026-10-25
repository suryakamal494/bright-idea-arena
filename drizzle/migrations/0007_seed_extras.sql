insert into public.submission_files (submission_id, name, url) values
  ('f0000000-0000-4000-8000-000000000003', 'Flow diagram sketch', 'https://picsum.photos/seed/jal-flow/800/500'),
  ('f0000000-0000-4000-8000-000000000004', 'Pilot photo — washroom bank', 'https://picsum.photos/seed/jal-pilot/800/500'),
  ('f0000000-0000-4000-8000-000000000001', 'Sensor breadboard sketch', 'https://picsum.photos/seed/agri-bread/800/500');

insert into public.judge_assignments (judge_id, track_id) values
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004');

insert into public.scores (submission_id, judge_id, criterion_scores, feedback, submitted, updated_at) values
  ('f0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002',
   '{"c0000000-0000-4000-8000-000000000001":8.5,"c0000000-0000-4000-8000-000000000002":9.0,"c0000000-0000-4000-8000-000000000003":8.25,"c0000000-0000-4000-8000-000000000004":9.25,"c0000000-0000-4000-8000-000000000005":8.0}',
   'Excellent real-world trial with quantified outcomes. Strengthen the maintenance plan and add a cost breakdown per litre saved before the final presentation.',
   true, now() - interval '2 days');

insert into public.announcements (title, body, kind, link, created_by, created_at) values
  ('Welcome to the Social Innovation Ideathon 2026', 'Registrations are open for grades 8–12. Form your team, pick a track, and start your Stage 1 concept note. Teams of 2–5 members.', 'announcement', null, 'a0000000-0000-4000-8000-000000000001', now() - interval '12 days'),
  ('Stage 1 Guide: Writing a Strong Concept Note', 'Download the official template and see three worked examples from last year''s winners. Includes the judging rubric overview.', 'guide', 'https://example.com/guides/stage1-concept-note.pdf', 'a0000000-0000-4000-8000-000000000001', now() - interval '8 days'),
  ('Live Webinar: From Idea to Prototype', 'Join our mentors this Saturday, 5 PM IST, for a session on scoping an achievable prototype in 6 weeks. Bring your problem statements!', 'webinar', 'https://zoom.us/j/0000000000', 'a0000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('Toolkit: Data Collection for Student Projects', 'A 12-page toolkit on surveys, interviews and simple experiments — with consent templates for parent-approved research.', 'guide', 'https://example.com/guides/data-toolkit.pdf', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day');

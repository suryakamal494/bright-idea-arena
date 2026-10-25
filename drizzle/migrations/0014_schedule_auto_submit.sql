-- lovable-cron-fallback-reviewed: daily reconciliation backstop; deadline finalisation normally happens in-app the moment any member opens the form after the deadline
create extension if not exists pg_cron;
select cron.schedule(
  'auto-submit-submissions',
  '30 0 * * *',
  $$select public.auto_submit_due_submissions()$$
);
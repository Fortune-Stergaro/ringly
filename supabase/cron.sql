{-- Run ONCE in the Supabase SQL editor after deploying (replace the two placeholders).
-- Tip: store the secret in Supabase Vault instead of inlining it.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ringly-process-jobs', '* * * * *',
  $$ select net.http_post(
       url := 'https://ringly.vercel.app/api/cron/process-jobs',
       headers := jsonb_build_object('Authorization', 'Bearer ', 'Content-Type', 'application/json'),
       body := '{}'::jsonb, timeout_milliseconds := 55000) $$);

select cron.schedule(
  'ringly-extend-occurrences', '15 2 * * *',
  $$ select net.http_post(
       url := 'https://https://ringly.vercel.app/api/cron/extend-occurrences',
       headers := jsonb_build_object('Authorization', 'Bearer ', 'Content-Type', 'application/json'),
       body := '{}'::jsonb, timeout_milliseconds := 55000) $$);
}
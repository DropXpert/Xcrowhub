-- 0007: pg_cron schedule for on-chain watcher
--
-- Calls the /watcher Edge Function every minute to pick up new on-chain payments.
-- Requires pg_net extension (enabled by default on Supabase).
--
-- To check scheduled jobs:  SELECT * FROM cron.job;
-- To remove:  SELECT cron.unschedule('proofhold-nim-watcher');
--
-- Replace <SUPABASE_URL> and <SERVICE_ROLE_KEY> with real values before running,
-- OR run via the Supabase SQL editor with the values substituted.

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if re-running this migration
SELECT cron.unschedule('proofhold-nim-watcher') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'proofhold-nim-watcher'
);

-- Schedule watcher every minute
-- Note: substitute @SUPABASE_URL and @SERVICE_ROLE_KEY before applying
SELECT cron.schedule(
  'proofhold-nim-watcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url        := 'https://cylficyjlxfkobeqakse.supabase.co/functions/v1/watcher',
    headers    := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body       := '{"network":"nimiq"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

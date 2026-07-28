-- watcher_cursors is an internal server-only table (on-chain poller state).
-- No user policies are needed: service role bypasses RLS and is the only writer.
-- Enabling RLS blocks all authenticated/anon access from PostgREST.
alter table public.watcher_cursors enable row level security;

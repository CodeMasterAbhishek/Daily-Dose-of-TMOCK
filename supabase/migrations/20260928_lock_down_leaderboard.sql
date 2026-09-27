-- Apply this migration to the existing Supabase project as soon as possible.
-- The frontend remains able to read the leaderboard, but no public client may
-- insert, update or delete rows until owner-bound authentication is introduced.
BEGIN;

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert access" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public update access" ON public.leaderboard;

REVOKE INSERT, UPDATE, DELETE ON public.leaderboard FROM anon, authenticated;

COMMIT;

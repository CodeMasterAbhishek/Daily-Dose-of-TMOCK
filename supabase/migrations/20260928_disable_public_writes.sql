-- Revoke public write access to prevent stored XSS and row takeover

-- 1. Ensure RLS is enabled on the leaderboard table
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing permissive policies (if they exist)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON leaderboard;
DROP POLICY IF EXISTS "Enable insert for anon" ON leaderboard;
DROP POLICY IF EXISTS "Enable update for anon" ON leaderboard;
DROP POLICY IF EXISTS "Enable delete for anon" ON leaderboard;
DROP POLICY IF EXISTS "Public can insert" ON leaderboard;
DROP POLICY IF EXISTS "Public can update" ON leaderboard;
DROP POLICY IF EXISTS "Public can delete" ON leaderboard;

-- 3. Create a policy that strictly allows reading (SELECT) for everyone
CREATE POLICY "Public read access"
ON leaderboard FOR SELECT
USING (true);

-- No INSERT, UPDATE, or DELETE policies are created, making it effectively read-only.

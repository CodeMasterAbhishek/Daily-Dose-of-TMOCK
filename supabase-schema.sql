-- ==============================================================================
-- Supabase SQL Schema for Daily Dose of TMKOC Global Leaderboard
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create the leaderboard table
CREATE TABLE IF NOT EXISTS public.leaderboard (
    user_id TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    watched_count INTEGER DEFAULT 0 CHECK (watched_count >= 0),
    watch_hours NUMERIC(10, 6) DEFAULT 0 CHECK (watch_hours >= 0),
    fan_tier TEXT DEFAULT 'Gokuldham Resident',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON leaderboard
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- 2. Enable Row Level Security (RLS) for security
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow everyone to read the leaderboard (SELECT)
CREATE POLICY "Allow public read access"
ON public.leaderboard
FOR SELECT
USING (true);

-- 4. Policy: Allow visitors to insert their stats record (INSERT)
CREATE POLICY "Allow public insert access"
ON public.leaderboard
FOR INSERT
WITH CHECK (true);

-- 5. Policy: Allow visitors to update their own stats record (UPDATE)
-- Security Note: Since this is a client-side app, users can update any row. Ensure non-negative stats.
CREATE POLICY "Allow public update access"
ON public.leaderboard
FOR UPDATE
USING (true)
WITH CHECK (watched_count >= 0 AND watch_hours >= 0);

-- 6. Create performance index for fast ranking retrieval
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank 
ON public.leaderboard (watched_count DESC, watch_hours DESC);

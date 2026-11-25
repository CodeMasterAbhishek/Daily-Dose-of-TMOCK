-- ==============================================================================
-- Migration: Create dead_links table for Crowdsourced Auto-Healing
-- Date: 2026-10-02
-- Description:
--   1. Creates public.dead_links table for crowdsourced broken link reports.
--   2. Enables Row Level Security (RLS) with input validation (11-char YouTube ID, valid ep).
--   3. Grants read access for visitors to avoid broken links instantly.
--   4. Grants delete access for nightly auto-healer bot.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.dead_links (
    id BIGSERIAL PRIMARY KEY,
    episode_number INTEGER NOT NULL CHECK (episode_number > 0 AND episode_number <= 6000),
    video_id TEXT NOT NULL CHECK (length(video_id) = 11),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS
ALTER TABLE public.dead_links ENABLE ROW LEVEL SECURITY;

-- 1. Policy: Allow visitors to read known dead links
DROP POLICY IF EXISTS "Allow public read access" ON public.dead_links;
CREATE POLICY "Allow public read access"
ON public.dead_links
FOR SELECT
USING (true);

-- 2. Policy: Allow visitors to report broken links with validation
DROP POLICY IF EXISTS "Allow public insert access" ON public.dead_links;
CREATE POLICY "Allow public insert access"
ON public.dead_links
FOR INSERT
WITH CHECK (
    episode_number > 0 AND 
    episode_number <= 6000 AND 
    length(video_id) = 11
);

-- 3. Policy: Allow nightly GitHub Action auto-healer to clean up resolved reports
DROP POLICY IF EXISTS "Allow delete access" ON public.dead_links;
CREATE POLICY "Allow delete access"
ON public.dead_links
FOR DELETE
USING (true);

-- Performance indexes for fast querying by video_id and episode_number
CREATE INDEX IF NOT EXISTS idx_dead_links_video_id ON public.dead_links (video_id);
CREATE INDEX IF NOT EXISTS idx_dead_links_episode_number ON public.dead_links (episode_number);

-- ==============================================================================
-- Migration: Secure RPC Sync for Daily Dose of TMKOC
-- Date: 2026-10-01
-- Description:
--   1. Keeps public.leaderboard strictly read-only for direct REST table queries.
--   2. Creates a private public.user_secrets table (hidden from public).
--   3. Creates a SECURITY DEFINER function public.sync_fan_stats() to safely
--      register new users and update stats with token ownership verification,
--      input sanitization, and reasonable bounds checking.
-- ==============================================================================

-- 1. Create the private user_secrets table for token verification
CREATE TABLE IF NOT EXISTS public.user_secrets (
    user_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS and revoke public access (only accessible inside SECURITY DEFINER functions)
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_secrets FROM anon, authenticated;

-- 2. Ensure public.leaderboard table exists and has RLS enabled
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- Leaderboard is strictly SELECT-only for direct API calls (prevents direct REST tampering)
DROP POLICY IF EXISTS "Public read access" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public read access" ON public.leaderboard;
CREATE POLICY "Public read access"
ON public.leaderboard
FOR SELECT
USING (true);

-- Ensure all direct public write policies are dropped
DROP POLICY IF EXISTS "Allow public insert access" ON public.leaderboard;
DROP POLICY IF EXISTS "Allow public update access" ON public.leaderboard;
DROP POLICY IF EXISTS "Public can insert" ON public.leaderboard;
DROP POLICY IF EXISTS "Public can update" ON public.leaderboard;
DROP POLICY IF EXISTS "Public can delete" ON public.leaderboard;

-- 3. Create the secure sync function
CREATE OR REPLACE FUNCTION public.sync_fan_stats(
    p_user_id TEXT,
    p_client_token TEXT,
    p_handle TEXT,
    p_watched_count INTEGER,
    p_watch_hours NUMERIC,
    p_fan_tier TEXT DEFAULT 'Gokuldham Resident'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_handle TEXT;
    v_token_hash TEXT;
    v_existing_token_hash TEXT;
    v_existing_user_id TEXT;
    v_sanitized_count INTEGER;
    v_sanitized_hours NUMERIC;
    v_clean_tier TEXT;
BEGIN
    -- A. Validate user_id
    IF p_user_id IS NULL OR length(trim(p_user_id)) < 8 OR length(p_user_id) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user ID');
    END IF;

    -- B. Validate client_token
    IF p_client_token IS NULL OR length(trim(p_client_token)) < 16 OR length(p_client_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid client token');
    END IF;

    -- C. Sanitize handle: strip HTML tags and special characters, limit to 30 chars
    v_clean_handle := trim(regexp_replace(COALESCE(p_handle, ''), '[<>"''&\\/]', '', 'g'));
    IF length(v_clean_handle) = 0 THEN
        v_clean_handle := 'Gokuldham resident ' || ((SELECT count(*) FROM public.leaderboard) + 1);
    ELSIF length(v_clean_handle) > 30 THEN
        v_clean_handle := substring(v_clean_handle from 1 for 30);
    END IF;

    -- D. Sanitize fan tier
    IF p_fan_tier IN ('Gokuldham Legend', 'Bapuji''s Favorite', 'Soda Shop Regular', 'Gokuldham Resident') THEN
        v_clean_tier := p_fan_tier;
    ELSE
        v_clean_tier := 'Gokuldham Resident';
    END IF;

    -- E. Sanitize watched_count and watch_hours (realistic bounds: 0 - 5000 episodes, 0 - 2500 hours)
    v_sanitized_count := GREATEST(0, LEAST(5000, COALESCE(p_watched_count, 0)));
    v_sanitized_hours := GREATEST(0, LEAST(2500, ROUND(COALESCE(p_watch_hours, 0)::numeric, 4)));

    -- F. Compute token hash (MD5 with secret salt)
    v_token_hash := md5(p_client_token || ':tmkoc_salt_2026');

    -- G. Verify ownership in user_secrets
    SELECT token_hash INTO v_existing_token_hash
    FROM public.user_secrets
    WHERE user_id = p_user_id;

    IF v_existing_token_hash IS NOT NULL THEN
        -- Secret exists: verify caller owns this user_id
        IF v_existing_token_hash <> v_token_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token for user');
        END IF;
    ELSE
        -- First time seeing this user_id: register secret
        INSERT INTO public.user_secrets (user_id, token_hash)
        VALUES (p_user_id, v_token_hash)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- H. Upsert into public.leaderboard
    SELECT user_id INTO v_existing_user_id
    FROM public.leaderboard
    WHERE user_id = p_user_id;

    IF v_existing_user_id IS NOT NULL THEN
        UPDATE public.leaderboard
        SET 
            handle = v_clean_handle,
            watched_count = GREATEST(watched_count, v_sanitized_count),
            watch_hours = GREATEST(watch_hours, v_sanitized_hours),
            fan_tier = v_clean_tier,
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE user_id = p_user_id;
    ELSE
        INSERT INTO public.leaderboard (
            user_id,
            handle,
            watched_count,
            watch_hours,
            fan_tier,
            updated_at
        ) VALUES (
            p_user_id,
            v_clean_handle,
            v_sanitized_count,
            v_sanitized_hours,
            v_clean_tier,
            TIMEZONE('utc'::text, NOW())
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'handle', v_clean_handle,
        'watched_count', v_sanitized_count,
        'watch_hours', v_sanitized_hours,
        'fan_tier', v_clean_tier
    );
END;
$$;

-- 4. Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.sync_fan_stats(TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT) TO anon, authenticated;

-- ==============================================================================
-- Migration: In-House Episode Reactions (Likes & Dislikes) - Phase 1
-- Date: 2026-11-27
-- Description:
--   1. Creates public.episode_reactions (1 vote per user_id per episode_id).
--   2. Locks table writes behind RLS so direct REST inserts/updates/deletes
--      cannot tamper with other users' reactions.
--   3. Creates SECURITY DEFINER RPCs:
--      - public.get_episode_reactions(p_episode_id, p_user_id)
--      - public.set_episode_reaction(p_user_id, p_client_token, p_episode_id, p_reaction)
--      reusing public.user_secrets token verification from 20261001_secure_rpc_sync.sql.
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create episode_reactions table
CREATE TABLE IF NOT EXISTS public.episode_reactions (
    user_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    reaction SMALLINT NOT NULL CHECK (reaction IN (-1, 1)),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    PRIMARY KEY (user_id, episode_id)
);

-- Index for fast like/dislike aggregation per episode
CREATE INDEX IF NOT EXISTS idx_episode_reactions_ep_reaction
ON public.episode_reactions (episode_id, reaction);

-- 2. Enable RLS and keep table strictly read-only for direct REST calls
ALTER TABLE public.episode_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.episode_reactions;
CREATE POLICY "Allow public read access"
ON public.episode_reactions
FOR SELECT
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.episode_reactions FROM anon, authenticated;

-- 3. Fast aggregated summary RPC for any episode + caller's active vote
CREATE OR REPLACE FUNCTION public.get_episode_reactions(
    p_episode_id TEXT,
    p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_ep TEXT;
    v_likes BIGINT := 0;
    v_dislikes BIGINT := 0;
    v_user_reaction SMALLINT := 0;
BEGIN
    v_clean_ep := trim(COALESCE(p_episode_id, ''));
    IF length(v_clean_ep) = 0 OR length(v_clean_ep) > 32 OR v_clean_ep !~ '^[A-Za-z0-9_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid episode ID');
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE reaction = 1),
        COUNT(*) FILTER (WHERE reaction = -1)
    INTO v_likes, v_dislikes
    FROM public.episode_reactions
    WHERE episode_id = v_clean_ep;

    IF p_user_id IS NOT NULL AND length(trim(p_user_id)) >= 8 THEN
        SELECT COALESCE(reaction, 0) INTO v_user_reaction
        FROM public.episode_reactions
        WHERE episode_id = v_clean_ep AND user_id = trim(p_user_id)
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'episode_id', v_clean_ep,
        'likes_count', COALESCE(v_likes, 0),
        'dislikes_count', COALESCE(v_dislikes, 0),
        'user_reaction', COALESCE(v_user_reaction, 0)
    );
END;
$$;

-- 4. Token-authenticated RPC to set, switch, or clear a user's reaction
CREATE OR REPLACE FUNCTION public.set_episode_reaction(
    p_user_id TEXT,
    p_client_token TEXT,
    p_episode_id TEXT,
    p_reaction SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_user TEXT;
    v_clean_ep TEXT;
    v_token_hash TEXT;
    v_existing_token_hash TEXT;
    v_likes BIGINT := 0;
    v_dislikes BIGINT := 0;
BEGIN
    v_clean_user := trim(COALESCE(p_user_id, ''));
    IF length(v_clean_user) < 8 OR length(v_clean_user) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user ID');
    END IF;

    IF p_client_token IS NULL OR length(trim(p_client_token)) < 16 OR length(p_client_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid client token');
    END IF;

    v_clean_ep := trim(COALESCE(p_episode_id, ''));
    IF length(v_clean_ep) = 0 OR length(v_clean_ep) > 32 OR v_clean_ep !~ '^[A-Za-z0-9_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid episode ID');
    END IF;

    IF p_reaction NOT IN (-1, 0, 1) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reaction value');
    END IF;

    -- Compute token hash matching sync_fan_stats
    v_token_hash := md5(p_client_token || ':tmkoc_salt_2026');

    SELECT token_hash INTO v_existing_token_hash
    FROM public.user_secrets
    WHERE user_id = v_clean_user;

    IF v_existing_token_hash IS NOT NULL THEN
        IF v_existing_token_hash <> v_token_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token for user');
        END IF;
    ELSE
        INSERT INTO public.user_secrets (user_id, token_hash)
        VALUES (v_clean_user, v_token_hash)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT token_hash INTO v_existing_token_hash
        FROM public.user_secrets
        WHERE user_id = v_clean_user;

        IF v_existing_token_hash <> v_token_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: token mismatch');
        END IF;
    END IF;

    IF p_reaction = 0 THEN
        DELETE FROM public.episode_reactions
        WHERE user_id = v_clean_user AND episode_id = v_clean_ep;
    ELSE
        INSERT INTO public.episode_reactions (user_id, episode_id, reaction, updated_at)
        VALUES (v_clean_user, v_clean_ep, p_reaction, TIMEZONE('utc'::text, NOW()))
        ON CONFLICT (user_id, episode_id) DO UPDATE
        SET reaction = EXCLUDED.reaction,
            updated_at = TIMEZONE('utc'::text, NOW());
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE reaction = 1),
        COUNT(*) FILTER (WHERE reaction = -1)
    INTO v_likes, v_dislikes
    FROM public.episode_reactions
    WHERE episode_id = v_clean_ep;

    RETURN jsonb_build_object(
        'success', true,
        'episode_id', v_clean_ep,
        'likes_count', COALESCE(v_likes, 0),
        'dislikes_count', COALESCE(v_dislikes, 0),
        'user_reaction', p_reaction
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_episode_reactions(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_episode_reaction(TEXT, TEXT, TEXT, SMALLINT) TO anon, authenticated;

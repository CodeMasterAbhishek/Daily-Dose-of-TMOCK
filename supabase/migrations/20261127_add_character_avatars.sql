-- ==============================================================================
-- Migration: Gokuldham Character Avatars - Phase 3
-- Date: 2026-11-27
-- Description:
--   1. Adds avatar_id column to public.leaderboard and public.episode_comments.
--   2. Adds public.set_user_avatar() SECURITY DEFINER RPC for instant avatar
--      updates synced across leaderboard & comments.
--   3. Extends sync_fan_stats(), get_episode_comments(), and post_episode_comment()
--      with optional avatar_id support while staying backward-compatible with old calls.
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Add avatar_id columns safely
ALTER TABLE public.leaderboard
    ADD COLUMN IF NOT EXISTS avatar_id VARCHAR(30) DEFAULT 'default';

ALTER TABLE public.episode_comments
    ADD COLUMN IF NOT EXISTS avatar_id VARCHAR(30) DEFAULT 'default';

-- 2. Internal helper to validate allowed Gokuldham avatar IDs
CREATE OR REPLACE FUNCTION public._sanitize_avatar_id(p_avatar_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_val TEXT;
BEGIN
    v_val := lower(trim(COALESCE(p_avatar_id, '')));
    IF v_val IN (
        'default', 'jethalal', 'daya', 'bhide', 'popatlal',
        'sodhi', 'babita', 'champaklal', 'tapu', 'hathi', 'mehta'
    ) THEN
        RETURN v_val;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._sanitize_avatar_id(TEXT) FROM PUBLIC, anon, authenticated;

-- 3. Dedicated token-verified RPC to update user avatar across leaderboard & comments
CREATE OR REPLACE FUNCTION public.set_user_avatar(
    p_user_id TEXT,
    p_client_token TEXT,
    p_avatar_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_err TEXT;
    v_clean_user TEXT;
    v_clean_avatar TEXT;
    v_default_handle TEXT;
BEGIN
    v_auth_err := public._verify_or_register_client_token(p_user_id, p_client_token);
    IF v_auth_err IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_err);
    END IF;

    v_clean_user := trim(p_user_id);
    v_clean_avatar := COALESCE(public._sanitize_avatar_id(p_avatar_id), 'default');

    UPDATE public.leaderboard
    SET avatar_id = v_clean_avatar,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE user_id = v_clean_user;

    IF NOT FOUND THEN
        v_default_handle := 'Gokuldham resident ' || ((SELECT count(*) FROM public.leaderboard) + 1);
        INSERT INTO public.leaderboard (user_id, handle, watched_count, watch_hours, fan_tier, avatar_id)
        VALUES (v_clean_user, v_default_handle, 0, 0, 'Gokuldham Resident', v_clean_avatar);
    END IF;

    UPDATE public.episode_comments
    SET avatar_id = v_clean_avatar
    WHERE user_id = v_clean_user;

    RETURN jsonb_build_object(
        'success', true,
        'avatar_id', v_clean_avatar
    );
END;
$$;

-- 4. Update sync_fan_stats (drop 6-arg version so defaulted 7-arg signature is unambiguous)
DROP FUNCTION IF EXISTS public.sync_fan_stats(TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.sync_fan_stats(
    p_user_id TEXT,
    p_client_token TEXT,
    p_handle TEXT,
    p_watched_count INTEGER,
    p_watch_hours NUMERIC,
    p_fan_tier TEXT DEFAULT 'Gokuldham Resident',
    p_avatar_id TEXT DEFAULT NULL
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
    v_clean_avatar TEXT;
BEGIN
    IF p_user_id IS NULL OR length(trim(p_user_id)) < 8 OR length(p_user_id) > 64 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user ID');
    END IF;

    IF p_client_token IS NULL OR length(trim(p_client_token)) < 16 OR length(p_client_token) > 128 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid client token');
    END IF;

    v_clean_handle := trim(regexp_replace(COALESCE(p_handle, ''), '[<>"''&\\/]', '', 'g'));
    IF length(v_clean_handle) = 0 THEN
        v_clean_handle := 'Gokuldham resident ' || ((SELECT count(*) FROM public.leaderboard) + 1);
    ELSIF length(v_clean_handle) > 30 THEN
        v_clean_handle := substring(v_clean_handle from 1 for 30);
    END IF;

    IF p_fan_tier IN ('Gokuldham Legend', 'Bapuji''s Favorite', 'Soda Shop Regular', 'Gokuldham Resident') THEN
        v_clean_tier := p_fan_tier;
    ELSE
        v_clean_tier := 'Gokuldham Resident';
    END IF;

    v_sanitized_count := GREATEST(0, LEAST(5000, COALESCE(p_watched_count, 0)));
    v_sanitized_hours := GREATEST(0, LEAST(2500, ROUND(COALESCE(p_watch_hours, 0)::numeric, 4)));
    v_clean_avatar := public._sanitize_avatar_id(p_avatar_id);

    v_token_hash := md5(p_client_token || ':tmkoc_salt_2026');

    SELECT token_hash INTO v_existing_token_hash
    FROM public.user_secrets
    WHERE user_id = p_user_id;

    IF v_existing_token_hash IS NOT NULL THEN
        IF v_existing_token_hash <> v_token_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: invalid token for user');
        END IF;
    ELSE
        INSERT INTO public.user_secrets (user_id, token_hash)
        VALUES (p_user_id, v_token_hash)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT token_hash INTO v_existing_token_hash
        FROM public.user_secrets
        WHERE user_id = p_user_id;

        IF v_existing_token_hash <> v_token_hash THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: token mismatch');
        END IF;
    END IF;

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
            avatar_id = COALESCE(v_clean_avatar, avatar_id, 'default'),
            updated_at = TIMEZONE('utc'::text, NOW())
        WHERE user_id = p_user_id;
    ELSE
        INSERT INTO public.leaderboard (
            user_id,
            handle,
            watched_count,
            watch_hours,
            fan_tier,
            avatar_id
        )
        VALUES (
            p_user_id,
            v_clean_handle,
            v_sanitized_count,
            v_sanitized_hours,
            v_clean_tier,
            COALESCE(v_clean_avatar, 'default')
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'handle', v_clean_handle,
        'watched_count', v_sanitized_count,
        'avatar_id', COALESCE(v_clean_avatar, 'default')
    );
END;
$$;

-- 5. Update get_episode_comments to include avatar_id cleanly
CREATE OR REPLACE FUNCTION public.get_episode_comments(
    p_episode_id TEXT,
    p_user_id TEXT DEFAULT NULL,
    p_sort TEXT DEFAULT 'top',
    p_limit INTEGER DEFAULT 30,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_ep TEXT;
    v_clean_user TEXT;
    v_sort TEXT;
    v_limit INTEGER;
    v_offset INTEGER;
    v_total BIGINT := 0;
    v_comments JSONB := '[]'::jsonb;
BEGIN
    v_clean_ep := trim(COALESCE(p_episode_id, ''));
    IF length(v_clean_ep) = 0 OR length(v_clean_ep) > 32 OR v_clean_ep !~ '^[A-Za-z0-9_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid episode ID');
    END IF;

    v_clean_user := trim(COALESCE(p_user_id, ''));
    v_sort := CASE WHEN lower(COALESCE(p_sort, 'top')) = 'newest' THEN 'newest' ELSE 'top' END;
    v_limit := GREATEST(1, LEAST(50, COALESCE(p_limit, 30)));
    v_offset := GREATEST(0, COALESCE(p_offset, 0));

    SELECT COUNT(*) INTO v_total
    FROM public.episode_comments
    WHERE episode_id = v_clean_ep;

    SELECT COALESCE(jsonb_agg(row_obj), '[]'::jsonb)
    INTO v_comments
    FROM (
        SELECT jsonb_build_object(
            'id', c.id,
            'episode_id', c.episode_id,
            'user_handle', COALESCE(NULLIF(trim(lb.handle), ''), c.user_handle),
            'avatar_id', COALESCE(NULLIF(trim(lb.avatar_id), ''), NULLIF(trim(c.avatar_id), ''), 'default'),
            'content', c.content,
            'likes_count', c.likes_count,
            'user_liked', (
                v_clean_user <> '' AND EXISTS (
                    SELECT 1 FROM public.comment_likes cl
                    WHERE cl.comment_id = c.id AND cl.user_id = v_clean_user
                )
            ),
            'is_own', (v_clean_user <> '' AND c.user_id = v_clean_user),
            'created_at', c.created_at
        ) AS row_obj
        FROM public.episode_comments c
        LEFT JOIN public.leaderboard lb ON lb.user_id = c.user_id
        WHERE c.episode_id = v_clean_ep
        ORDER BY
            CASE WHEN v_sort = 'top' THEN c.likes_count END DESC NULLS LAST,
            c.created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'episode_id', v_clean_ep,
        'total_count', COALESCE(v_total, 0),
        'comments', v_comments
    );
END;
$$;

-- 6. Update post_episode_comment with optional p_avatar_id (drop 5-arg signature cleanly)
DROP FUNCTION IF EXISTS public.post_episode_comment(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.post_episode_comment(
    p_user_id TEXT,
    p_client_token TEXT,
    p_episode_id TEXT,
    p_handle TEXT,
    p_content TEXT,
    p_avatar_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_err TEXT;
    v_clean_user TEXT;
    v_clean_ep TEXT;
    v_clean_handle TEXT;
    v_clean_content TEXT;
    v_clean_avatar TEXT;
    v_lb_handle TEXT;
    v_lb_avatar TEXT;
    v_last_comment_at TIMESTAMPTZ;
    v_wait_secs INTEGER;
    v_inserted public.episode_comments%ROWTYPE;
BEGIN
    v_auth_err := public._verify_or_register_client_token(p_user_id, p_client_token);
    IF v_auth_err IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_err);
    END IF;

    v_clean_user := trim(p_user_id);
    v_clean_ep := trim(COALESCE(p_episode_id, ''));
    IF length(v_clean_ep) = 0 OR length(v_clean_ep) > 32 OR v_clean_ep !~ '^[A-Za-z0-9_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid episode ID');
    END IF;

    v_clean_content := regexp_replace(COALESCE(p_content, ''), '<[^>]*>', '', 'g');
    v_clean_content := replace(v_clean_content, E'\r\n', E'\n');
    v_clean_content := regexp_replace(v_clean_content, E'\n{3,}', E'\n\n', 'g');
    v_clean_content := trim(v_clean_content);

    IF length(v_clean_content) < 2 THEN
        RETURN jsonb_build_object('success', false, 'code', 'too_short', 'error', 'Comment must be at least 2 characters.');
    END IF;
    IF length(v_clean_content) > 500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'too_long', 'error', 'Comment must be 500 characters or fewer.');
    END IF;

    IF v_clean_content ~* '\m(fuck|fucking|fucker|shit|bitch|asshole|cunt|whore|slut|bastard|madarchod|behenchod|bhenchod|bhosdike|chutiya|gandu|randi)\M' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'profanity',
            'error', 'Please keep Gokuldham comments respectful and family-friendly!'
        );
    END IF;

    SELECT created_at INTO v_last_comment_at
    FROM public.episode_comments
    WHERE user_id = v_clean_user
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_comment_at IS NOT NULL AND (NOW() - v_last_comment_at) < INTERVAL '30 seconds' THEN
        v_wait_secs := GREATEST(1, CEIL(30 - EXTRACT(EPOCH FROM (NOW() - v_last_comment_at)))::INTEGER);
        RETURN jsonb_build_object(
            'success', false,
            'code', 'rate_limited',
            'retry_after', v_wait_secs,
            'error', 'Please wait ' || v_wait_secs || 's before posting another comment.'
        );
    END IF;

    SELECT handle, avatar_id INTO v_lb_handle, v_lb_avatar
    FROM public.leaderboard
    WHERE user_id = v_clean_user
    LIMIT 1;

    v_clean_handle := COALESCE(NULLIF(trim(v_lb_handle), ''), trim(regexp_replace(COALESCE(p_handle, ''), '[<>"''&\\/]', '', 'g')));
    IF length(v_clean_handle) = 0 THEN
        v_clean_handle := 'Gokuldham Resident';
    ELSIF length(v_clean_handle) > 30 THEN
        v_clean_handle := substring(v_clean_handle from 1 for 30);
    END IF;

    v_clean_avatar := COALESCE(
        public._sanitize_avatar_id(p_avatar_id),
        public._sanitize_avatar_id(v_lb_avatar),
        'default'
    );

    INSERT INTO public.episode_comments (episode_id, user_id, user_handle, avatar_id, content, likes_count)
    VALUES (v_clean_ep, v_clean_user, v_clean_handle, v_clean_avatar, v_clean_content, 0)
    RETURNING * INTO v_inserted;

    RETURN jsonb_build_object(
        'success', true,
        'comment', jsonb_build_object(
            'id', v_inserted.id,
            'episode_id', v_inserted.episode_id,
            'user_handle', v_inserted.user_handle,
            'avatar_id', v_inserted.avatar_id,
            'content', v_inserted.content,
            'likes_count', v_inserted.likes_count,
            'user_liked', false,
            'is_own', true,
            'created_at', v_inserted.created_at
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_avatar(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_fan_stats(TEXT, TEXT, TEXT, INTEGER, NUMERIC, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_episode_comments(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_episode_comment(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- Migration: In-House Superfan Comments & Comment Upvotes - Phase 2
-- Date: 2026-11-27
-- Description:
--   1. Creates public.episode_comments and public.comment_likes tables.
--   2. Enables strict RLS (public read-only; all mutations via SECURITY DEFINER RPCs).
--   3. Creates token-authenticated RPCs:
--      - public.get_episode_comments(p_episode_id, p_user_id, p_sort, p_limit, p_offset)
--      - public.post_episode_comment(p_user_id, p_client_token, p_episode_id, p_handle, p_content)
--      - public.toggle_comment_like(p_user_id, p_client_token, p_comment_id)
--      - public.delete_episode_comment(p_user_id, p_client_token, p_comment_id)
--   4. Enforces 30-second anti-spam cooldown, HTML stripping, and family-friendly filter.
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create episode_comments table
CREATE TABLE IF NOT EXISTS public.episode_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_handle VARCHAR(50) NOT NULL,
    content VARCHAR(500) NOT NULL,
    likes_count INTEGER DEFAULT 0 CHECK (likes_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_episode_comments_ep_created
ON public.episode_comments (episode_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episode_comments_ep_likes
ON public.episode_comments (episode_id, likes_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episode_comments_user_created
ON public.episode_comments (user_id, created_at DESC);

-- 2. Create comment_likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
    comment_id UUID NOT NULL REFERENCES public.episode_comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_user
ON public.comment_likes (user_id, comment_id);

-- 3. Enable RLS and lock down direct table writes
ALTER TABLE public.episode_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.episode_comments;
CREATE POLICY "Allow public read access"
ON public.episode_comments
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON public.comment_likes;
CREATE POLICY "Allow public read access"
ON public.comment_likes
FOR SELECT
USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.episode_comments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.comment_likes FROM anon, authenticated;

-- 4. Shared internal helper to verify or register client token safely
CREATE OR REPLACE FUNCTION public._verify_or_register_client_token(
    p_user_id TEXT,
    p_client_token TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_user TEXT;
    v_token_hash TEXT;
    v_existing_token_hash TEXT;
BEGIN
    v_clean_user := trim(COALESCE(p_user_id, ''));
    IF length(v_clean_user) < 8 OR length(v_clean_user) > 64 THEN
        RETURN 'Invalid user ID';
    END IF;

    IF p_client_token IS NULL OR length(trim(p_client_token)) < 16 OR length(p_client_token) > 128 THEN
        RETURN 'Invalid client token';
    END IF;

    v_token_hash := md5(p_client_token || ':tmkoc_salt_2026');

    SELECT token_hash INTO v_existing_token_hash
    FROM public.user_secrets
    WHERE user_id = v_clean_user;

    IF v_existing_token_hash IS NOT NULL THEN
        IF v_existing_token_hash <> v_token_hash THEN
            RETURN 'Unauthorized: invalid token for user';
        END IF;
    ELSE
        INSERT INTO public.user_secrets (user_id, token_hash)
        VALUES (v_clean_user, v_token_hash)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT token_hash INTO v_existing_token_hash
        FROM public.user_secrets
        WHERE user_id = v_clean_user;

        IF v_existing_token_hash <> v_token_hash THEN
            RETURN 'Unauthorized: token mismatch';
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_or_register_client_token(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 5. Fetch paginated episode comments with live handle lookup and caller upvote status
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

-- 6. Post a sanitized, rate-limited comment for an episode
CREATE OR REPLACE FUNCTION public.post_episode_comment(
    p_user_id TEXT,
    p_client_token TEXT,
    p_episode_id TEXT,
    p_handle TEXT,
    p_content TEXT
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
    v_lb_handle TEXT;
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

    -- Strip HTML tags and normalize excessive newlines
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

    -- Family-friendly profanity check
    IF v_clean_content ~* '\m(fuck|fucking|fucker|shit|bitch|asshole|cunt|whore|slut|bastard|madarchod|behenchod|bhenchod|bhosdike|chutiya|gandu|randi)\M' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'profanity',
            'error', 'Please keep Gokuldham comments respectful and family-friendly!'
        );
    END IF;

    -- 30-second anti-spam rate limit per user
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

    -- Resolve handle cleanly (prefer leaderboard handle if synced, else sanitized p_handle)
    SELECT handle INTO v_lb_handle
    FROM public.leaderboard
    WHERE user_id = v_clean_user
    LIMIT 1;

    v_clean_handle := COALESCE(NULLIF(trim(v_lb_handle), ''), trim(regexp_replace(COALESCE(p_handle, ''), '[<>"''&\\/]', '', 'g')));
    IF length(v_clean_handle) = 0 THEN
        v_clean_handle := 'Gokuldham Resident';
    ELSIF length(v_clean_handle) > 30 THEN
        v_clean_handle := substring(v_clean_handle from 1 for 30);
    END IF;

    INSERT INTO public.episode_comments (episode_id, user_id, user_handle, content, likes_count)
    VALUES (v_clean_ep, v_clean_user, v_clean_handle, v_clean_content, 0)
    RETURNING * INTO v_inserted;

    RETURN jsonb_build_object(
        'success', true,
        'comment', jsonb_build_object(
            'id', v_inserted.id,
            'episode_id', v_inserted.episode_id,
            'user_handle', v_inserted.user_handle,
            'content', v_inserted.content,
            'likes_count', v_inserted.likes_count,
            'user_liked', false,
            'is_own', true,
            'created_at', v_inserted.created_at
        )
    );
END;
$$;

-- 7. Toggle upvote on a comment (atomic & exact count recomputation)
CREATE OR REPLACE FUNCTION public.toggle_comment_like(
    p_user_id TEXT,
    p_client_token TEXT,
    p_comment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_err TEXT;
    v_clean_user TEXT;
    v_exists BOOLEAN := false;
    v_already_liked BOOLEAN := false;
    v_user_liked BOOLEAN := false;
    v_likes_count INTEGER := 0;
BEGIN
    v_auth_err := public._verify_or_register_client_token(p_user_id, p_client_token);
    IF v_auth_err IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_err);
    END IF;

    v_clean_user := trim(p_user_id);

    SELECT EXISTS (
        SELECT 1 FROM public.episode_comments WHERE id = p_comment_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Comment not found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.comment_likes
        WHERE comment_id = p_comment_id AND user_id = v_clean_user
    ) INTO v_already_liked;

    IF v_already_liked THEN
        DELETE FROM public.comment_likes
        WHERE comment_id = p_comment_id AND user_id = v_clean_user;
        v_user_liked := false;
    ELSE
        INSERT INTO public.comment_likes (comment_id, user_id)
        VALUES (p_comment_id, v_clean_user)
        ON CONFLICT (comment_id, user_id) DO NOTHING;
        v_user_liked := true;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_likes_count
    FROM public.comment_likes
    WHERE comment_id = p_comment_id;

    UPDATE public.episode_comments
    SET likes_count = v_likes_count
    WHERE id = p_comment_id;

    RETURN jsonb_build_object(
        'success', true,
        'comment_id', p_comment_id,
        'likes_count', v_likes_count,
        'user_liked', v_user_liked
    );
END;
$$;

-- 8. Delete own comment
CREATE OR REPLACE FUNCTION public.delete_episode_comment(
    p_user_id TEXT,
    p_client_token TEXT,
    p_comment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_err TEXT;
    v_clean_user TEXT;
    v_deleted INTEGER := 0;
BEGIN
    v_auth_err := public._verify_or_register_client_token(p_user_id, p_client_token);
    IF v_auth_err IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', v_auth_err);
    END IF;

    v_clean_user := trim(p_user_id);

    DELETE FROM public.episode_comments
    WHERE id = p_comment_id AND user_id = v_clean_user;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Comment not found or unauthorized');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_comment_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_episode_comments(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_episode_comment(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_episode_comment(TEXT, TEXT, UUID) TO anon, authenticated;

/**
 * Supabase client and sync module for Daily Dose of TMKOC Global Leaderboard.
 * 100% Serverless, $0/month, powered by Supabase REST API.
 * Uses native fetch for zero latency and zero CDN dependency.
 */
import { getSelectedAvatarId, normalizeAvatarId } from './avatars.js?v=45';

export const SUPABASE_CONFIG = {
    url: 'https://rxubsmawvuigofveqyza.supabase.co',
    anonKey: 'sb_publishable_xbOMi4flq-JXLJNzkkoypA_ADaz12T0'
};

const STORAGE_USER_ID = 'tmkoc_user_uuid';
const STORAGE_USER_TOKEN = 'tmkoc_user_token';
const STORAGE_LOCAL_REACTIONS = 'tmkoc_episode_reactions';
const STORAGE_LOCAL_COMMENTS = 'tmkoc_episode_comments_local';

let reactionsBackendMissing = false;
let commentsBackendMissing = false;
let avatarColumnMissing = false;
let avatarRpcParamUnsupported = false;
const reactionSummaryCache = new Map();

function readLocalReactionsMap() {
    try {
        const raw = localStorage.getItem(STORAGE_LOCAL_REACTIONS);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeLocalReaction(episodeId, reaction) {
    if (!episodeId) return;
    try {
        const map = readLocalReactionsMap();
        if (reaction === 1 || reaction === -1) {
            map[episodeId] = reaction;
        } else {
            delete map[episodeId];
        }
        localStorage.setItem(STORAGE_LOCAL_REACTIONS, JSON.stringify(map));
    } catch (e) {}
}

export function getLocalEpisodeReaction(episodeId) {
    if (!episodeId) return 0;
    const map = readLocalReactionsMap();
    const val = Number(map[episodeId]);
    return (val === 1 || val === -1) ? val : 0;
}

export function getCachedEpisodeReactionSummary(episodeId) {
    if (!episodeId) return { likes: 0, dislikes: 0, userReaction: 0, synced: false };
    const cached = reactionSummaryCache.get(episodeId);
    if (cached) return { ...cached };
    const localVote = getLocalEpisodeReaction(episodeId);
    return {
        likes: localVote === 1 ? 1 : 0,
        dislikes: localVote === -1 ? 1 : 0,
        userReaction: localVote,
        synced: false
    };
}

export function setCachedEpisodeReactionSummary(episodeId, summary) {
    if (!episodeId || !summary) return;
    reactionSummaryCache.set(episodeId, {
        likes: Math.max(0, Number(summary.likes) || 0),
        dislikes: Math.max(0, Number(summary.dislikes) || 0),
        userReaction: (summary.userReaction === 1 || summary.userReaction === -1) ? summary.userReaction : 0,
        synced: Boolean(summary.synced)
    });
}

export function isSupabaseConfigured() {
    return Boolean(
        SUPABASE_CONFIG.url && 
        SUPABASE_CONFIG.anonKey && 
        !SUPABASE_CONFIG.url.includes('YOUR_') &&
        SUPABASE_CONFIG.url.startsWith('https://')
    );
}

function getCleanBaseUrl() {
    return SUPABASE_CONFIG.url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

export function getOrCreateUserId() {
    try {
        let userId = localStorage.getItem(STORAGE_USER_ID);
        if (!userId) {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                userId = crypto.randomUUID();
            } else {
                userId = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
            }
            localStorage.setItem(STORAGE_USER_ID, userId);
        }
        return userId;
    } catch (e) {
        return 'temp_user_' + Math.random().toString(36).substring(2, 9);
    }
}

export function getOrCreateUserToken() {
    try {
        let token = localStorage.getItem(STORAGE_USER_TOKEN);
        if (!token) {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                token = crypto.randomUUID() + '-' + crypto.randomUUID();
            } else {
                token = 'tok_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            }
            localStorage.setItem(STORAGE_USER_TOKEN, token);
        }
        return token;
    } catch (e) {
        return 'temp_tok_' + Math.random().toString(36).substring(2, 15);
    }
}

/**
 * Check if a username / handle is already taken by another registered user.
 * Case-insensitive match via Supabase REST API (ilike).
 */
export async function isHandleTaken(handle, currentUserId, myWatchedCount = 0) {
    if (!isSupabaseConfigured() || !handle) return false;
    const cleanHandle = handle.trim();
    if (!cleanHandle) return false;

    // Default placeholder handles are not restricted as unique custom names
    if (cleanHandle.toLowerCase().startsWith('gokuldham resident') || cleanHandle === '@TMKOCSuperfan') {
        return false;
    }

    const cleanBaseUrl = getCleanBaseUrl();
    const myId = currentUserId || getOrCreateUserId();
    const myCount = Number(myWatchedCount) || 0;

    try {
        const response = await fetch(
            `${cleanBaseUrl}/rest/v1/leaderboard?select=user_id,handle,watched_count,watch_hours&handle=ilike.${encodeURIComponent(cleanHandle)}`,
            {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) return false;
        const matches = await response.json();
        if (Array.isArray(matches) && matches.length > 0) {
            // Check if current user is one of the matches
            const myMatch = matches.find(m => m.user_id === myId);
            if (myMatch) {
                const recordedCount = Math.max(myCount, Number(myMatch.watched_count) || 0);
                const otherWithMore = matches.some(m => m.user_id !== myId && (Number(m.watched_count) || 0) > recordedCount);
                if (!otherWithMore) {
                    return false; // Current user is the legitimate owner/holder of this handle!
                }
            }

            // Filter to other users who have this handle
            const otherUsers = matches.filter(m => m.user_id !== myId);
            if (otherUsers.length === 0) {
                return false;
            }

            // An inactive placeholder account with 0 episodes does NOT block a real user with watched episodes!
            const activeCompetitors = otherUsers.filter(m => {
                const otherEps = Number(m.watched_count) || 0;
                if (otherEps === 0 && myCount > 0) {
                    return false;
                }
                return true;
            });

            return activeCompetitors.length > 0;
        }
        return false;
    } catch (e) {
        console.warn('Handle uniqueness check error:', e);
        return false;
    }
}

/**
 * Upsert current user's statistics to Supabase via secure RPC function.
 * Validates token ownership, sanitizes handle, and prevents row takeover.
 */
export async function syncUserToCloud({ handle, watchedCount, watchHours, fanTier, avatarId }) {
    if (!isSupabaseConfigured()) return { success: false, reason: 'unconfigured' };

    const userId = getOrCreateUserId();
    const clientToken = getOrCreateUserToken();
    const cleanHandle = (handle || '@TMKOCSuperfan').trim();
    const resolvedAvatar = normalizeAvatarId(avatarId || getSelectedAvatarId());

    // Guard against syncing a duplicate handle if taken by someone else
    if (!cleanHandle.startsWith('Gokuldham resident') && cleanHandle !== '@TMKOCSuperfan') {
        const taken = await isHandleTaken(cleanHandle, userId, Number(watchedCount) || 0);
        if (taken) {
            console.warn(`Cannot sync: handle "${cleanHandle}" is already taken by another user.`);
            return { success: false, reason: 'handle_taken' };
        }
    }

    const cleanBaseUrl = getCleanBaseUrl();
    const basePayload = {
        p_user_id: userId,
        p_client_token: clientToken,
        p_handle: cleanHandle,
        p_watched_count: Math.max(0, Math.min(5000, Number(watchedCount) || 0)),
        p_watch_hours: Math.max(0, Math.min(2500, Number(watchHours) || 0)),
        p_fan_tier: fanTier || 'Gokuldham Resident'
    };

    try {
        const postSync = (payload) => fetch(`${cleanBaseUrl}/rest/v1/rpc/sync_fan_stats`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let response = await postSync(
            avatarRpcParamUnsupported ? basePayload : { ...basePayload, p_avatar_id: resolvedAvatar }
        );

        if (!avatarRpcParamUnsupported && (response.status === 404 || response.status === 400)) {
            avatarRpcParamUnsupported = true;
            response = await postSync(basePayload);
        }

        if (!response.ok) {
            const errText = await response.text();
            console.warn('Leaderboard sync returned HTTP status:', response.status, errText);
            return { success: false, error: errText };
        }

        const data = await response.json();
        return { success: true, data };
    } catch (err) {
        console.warn('Network error syncing stats:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Report a dead/blocked YouTube link to the backend for Auto-Healing.
 * This table is only read securely by the Python GitHub Action, avoiding XSS risks.
 */
export async function reportDeadLinkToCloud(epNumber, videoId) {
    if (!isSupabaseConfigured()) return { success: false };
    
    try {
        const baseUrl = getCleanBaseUrl();
        const response = await fetch(`${baseUrl}/rest/v1/dead_links`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                episode_number: epNumber,
                video_id: videoId
            })
        });
        
        return { success: response.ok };
    } catch (e) {
        console.error('Failed to report dead link:', e);
        return { success: false };
    }
}

/**
 * Fetch crowdsourced dead/blocked YouTube links so visitors share the verification state
 * without needing to run background test players for known dead links.
 */
export async function fetchKnownDeadLinks() {
    if (!isSupabaseConfigured()) return [];
    try {
        const baseUrl = getCleanBaseUrl();
        const response = await fetch(`${baseUrl}/rest/v1/dead_links?select=video_id`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Accept': 'application/json'
            }
        });
        if (!response.ok) return [];
        const rows = await response.json();
        return (rows || []).map(r => r.video_id).filter(Boolean);
    } catch (e) {
        return [];
    }
}

/**
 * Fetch top fans for the global leaderboard via standard REST API
 */
export async function fetchGlobalLeaderboard(limit = 50) {
    if (!isSupabaseConfigured()) return null;

    const cleanBaseUrl = getCleanBaseUrl();

    try {
        const fetchLb = (includeAvatar) => {
            const cols = includeAvatar
                ? 'user_id,handle,watched_count,watch_hours,fan_tier,avatar_id,updated_at'
                : 'user_id,handle,watched_count,watch_hours,fan_tier,updated_at';
            return fetch(
                `${cleanBaseUrl}/rest/v1/leaderboard?select=${cols}&order=watched_count.desc,watch_hours.desc&limit=${limit}`,
                {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_CONFIG.anonKey,
                        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                        'Accept': 'application/json',
                        'Prefer': 'count=exact'
                    }
                }
            );
        };

        let response = await fetchLb(!avatarColumnMissing);
        if (!avatarColumnMissing && response.status === 400) {
            avatarColumnMissing = true;
            response = await fetchLb(false);
        }

        if (!response.ok) {
            console.warn('Leaderboard fetch returned HTTP status:', response.status);
            return null;
        }

        let totalCount = 0;
        const rangeHeader = response.headers.get('content-range');
        if (rangeHeader) {
            const parts = rangeHeader.split('/');
            if (parts.length === 2) {
                totalCount = parseInt(parts[1], 10);
            }
        }

        const data = await response.json();
        const myUserId = getOrCreateUserId();

        const fans = (data || []).map((row, index) => ({
            rank: (index + 1).toString(),
            handle: row.handle,
            count: Number(row.watched_count) || 0,
            hours: Number(row.watch_hours) || 0,
            level: row.fan_tier,
            avatarId: normalizeAvatarId(row.avatar_id || 'default'),
            isUser: row.user_id === myUserId
        }));
        
        return { fans, totalCount };
    } catch (err) {
        console.warn('Failed to fetch leaderboard:', err);
        return null;
    }
}

export async function fetchUserGlobalRank(watchedCount, watchHours) {
    if (!isSupabaseConfigured()) return null;
    const cleanBaseUrl = getCleanBaseUrl();
    try {
        const headers = { 'apikey': SUPABASE_CONFIG.anonKey, 'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' };
        const res1 = await fetch(`${cleanBaseUrl}/rest/v1/leaderboard?select=user_id&watched_count=gt.${watchedCount}`, { headers });
        const res2 = await fetch(`${cleanBaseUrl}/rest/v1/leaderboard?select=user_id&watched_count=eq.${watchedCount}&watch_hours=gt.${watchHours}`, { headers });
        const getCount = (r) => { const cr = r.headers.get('Content-Range'); return cr ? parseInt(cr.split('/')[1], 10) : 0; };
        return getCount(res1) + getCount(res2) + 1;
    } catch (e) { return null; }
}

/**
 * Fetch aggregated community likes/dislikes and current user's vote for an episode.
 * Falls back gracefully to localStorage if the Supabase RPC is not yet deployed or offline.
 */
export async function fetchEpisodeReactions(episodeId) {
    const cleanEp = String(episodeId || '').trim();
    const localFallback = getCachedEpisodeReactionSummary(cleanEp);
    if (!cleanEp || !isSupabaseConfigured() || reactionsBackendMissing) {
        return localFallback;
    }

    const cleanBaseUrl = getCleanBaseUrl();
    const userId = getOrCreateUserId();

    try {
        const response = await fetch(`${cleanBaseUrl}/rest/v1/rpc/get_episode_reactions`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_episode_id: cleanEp,
                p_user_id: userId
            })
        });

        if (response.status === 404) {
            reactionsBackendMissing = true;
            console.info('Episode reactions RPC not initialized on Supabase yet; using local reactions fallback.');
            return localFallback;
        }

        if (!response.ok) {
            return localFallback;
        }

        const data = await response.json();
        if (data && data.success) {
            const userReaction = (data.user_reaction === 1 || data.user_reaction === -1) ? data.user_reaction : 0;
            writeLocalReaction(cleanEp, userReaction);
            const summary = {
                likes: Math.max(0, Number(data.likes_count) || 0),
                dislikes: Math.max(0, Number(data.dislikes_count) || 0),
                userReaction,
                synced: true
            };
            setCachedEpisodeReactionSummary(cleanEp, summary);
            return summary;
        }
        return localFallback;
    } catch (e) {
        return localFallback;
    }
}

/**
 * Submit or clear a Like (1), Dislike (-1), or Neutral (0) vote for an episode.
 */
export async function setEpisodeReaction(episodeId, reaction) {
    const cleanEp = String(episodeId || '').trim();
    const normalized = (reaction === 1 || reaction === -1) ? reaction : 0;
    if (!cleanEp) return { success: false, reason: 'invalid_episode' };

    writeLocalReaction(cleanEp, normalized);
    const fallbackSummary = getCachedEpisodeReactionSummary(cleanEp);

    if (!isSupabaseConfigured() || reactionsBackendMissing) {
        return { success: true, ...fallbackSummary, synced: false };
    }

    const cleanBaseUrl = getCleanBaseUrl();
    const userId = getOrCreateUserId();
    const clientToken = getOrCreateUserToken();

    try {
        const response = await fetch(`${cleanBaseUrl}/rest/v1/rpc/set_episode_reaction`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_client_token: clientToken,
                p_episode_id: cleanEp,
                p_reaction: normalized
            })
        });

        if (response.status === 404) {
            reactionsBackendMissing = true;
            console.info('Episode reactions RPC not initialized on Supabase yet; stored reaction locally.');
            return { success: true, ...fallbackSummary, synced: false };
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn('Episode reaction sync failed:', response.status, errText);
            return { success: false, ...fallbackSummary, synced: false };
        }

        const data = await response.json();
        if (data && data.success) {
            const serverVote = (data.user_reaction === 1 || data.user_reaction === -1) ? data.user_reaction : 0;
            writeLocalReaction(cleanEp, serverVote);
            const summary = {
                likes: Math.max(0, Number(data.likes_count) || 0),
                dislikes: Math.max(0, Number(data.dislikes_count) || 0),
                userReaction: serverVote,
                synced: true
            };
            setCachedEpisodeReactionSummary(cleanEp, summary);
            return { success: true, ...summary };
        }

        return { success: false, error: data && data.error, ...fallbackSummary, synced: false };
    } catch (err) {
        return { success: true, ...fallbackSummary, synced: false };
    }
}

const CLIENT_COMMENT_PROFANITY_RE = /\b(fuck|fucking|fucker|shit|bitch|asshole|cunt|whore|slut|bastard|madarchod|behenchod|bhenchod|bhosdike|chutiya|gandu|randi)\b/i;

function readLocalCommentsStore() {
    try {
        const raw = localStorage.getItem(STORAGE_LOCAL_COMMENTS);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeLocalCommentsStore(store) {
    try {
        localStorage.setItem(STORAGE_LOCAL_COMMENTS, JSON.stringify(store));
    } catch (e) {}
}

async function callSupabaseRpc(rpcName, payload) {
    const cleanBaseUrl = getCleanBaseUrl();
    return fetch(`${cleanBaseUrl}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_CONFIG.anonKey,
            'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

function sortAndPaginateLocalComments(episodeId, sort, limit, offset) {
    const store = readLocalCommentsStore();
    const list = Array.isArray(store[episodeId]) ? [...store[episodeId]] : [];
    list.sort((a, b) => {
        if (sort === 'top') {
            const diff = (Number(b.likes_count) || 0) - (Number(a.likes_count) || 0);
            if (diff !== 0) return diff;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return {
        success: true,
        episode_id: episodeId,
        total_count: list.length,
        comments: list.slice(offset, offset + limit),
        synced: false
    };
}

/**
 * Fetch paginated comments for an episode.
 */
export async function fetchEpisodeComments(episodeId, { sort = 'top', limit = 30, offset = 0 } = {}) {
    const cleanEp = String(episodeId || '').trim();
    if (!cleanEp) return { success: false, total_count: 0, comments: [], synced: false };

    if (!isSupabaseConfigured() || commentsBackendMissing) {
        return sortAndPaginateLocalComments(cleanEp, sort, limit, offset);
    }

    try {
        const response = await callSupabaseRpc('get_episode_comments', {
            p_episode_id: cleanEp,
            p_user_id: getOrCreateUserId(),
            p_sort: sort === 'newest' ? 'newest' : 'top',
            p_limit: limit,
            p_offset: offset
        });

        if (response.status === 404) {
            commentsBackendMissing = true;
            console.info('Episode comments RPC not initialized on Supabase yet; using local comments fallback.');
            return sortAndPaginateLocalComments(cleanEp, sort, limit, offset);
        }

        if (!response.ok) {
            return sortAndPaginateLocalComments(cleanEp, sort, limit, offset);
        }

        const data = await response.json();
        if (data && data.success) {
            return {
                success: true,
                episode_id: cleanEp,
                total_count: Number(data.total_count) || 0,
                comments: Array.isArray(data.comments) ? data.comments : [],
                synced: true
            };
        }
        return sortAndPaginateLocalComments(cleanEp, sort, limit, offset);
    } catch (e) {
        return sortAndPaginateLocalComments(cleanEp, sort, limit, offset);
    }
}

/**
 * Post a sanitized comment for an episode with client + server rate-limit and profanity checks.
 */
export async function postEpisodeComment(episodeId, handle, content, avatarId = null) {
    const cleanEp = String(episodeId || '').trim();
    const cleanContent = String(content || '').trim();
    const cleanHandle = (String(handle || 'Gokuldham Resident').trim() || 'Gokuldham Resident').slice(0, 30);
    const resolvedAvatar = normalizeAvatarId(avatarId || getSelectedAvatarId());

    if (!cleanEp) return { success: false, error: 'Invalid episode ID.' };
    if (cleanContent.length < 2) return { success: false, code: 'too_short', error: 'Comment must be at least 2 characters.' };
    if (cleanContent.length > 500) return { success: false, code: 'too_long', error: 'Comment must be 500 characters or fewer.' };
    if (CLIENT_COMMENT_PROFANITY_RE.test(cleanContent)) {
        return { success: false, code: 'profanity', error: 'Please keep Gokuldham comments respectful and family-friendly!' };
    }

    const postLocalFallback = () => {
        const store = readLocalCommentsStore();
        const existingList = Array.isArray(store[cleanEp]) ? store[cleanEp] : [];
        const allLocal = Object.values(store).flat();
        const latestOwn = allLocal
            .filter(c => c && c.is_own && c.created_at)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (latestOwn) {
            const elapsed = (Date.now() - new Date(latestOwn.created_at).getTime()) / 1000;
            if (elapsed < 30) {
                const wait = Math.max(1, Math.ceil(30 - elapsed));
                return { success: false, code: 'rate_limited', retry_after: wait, error: `Please wait ${wait}s before posting another comment.`, synced: false };
            }
        }
        const localComment = {
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            episode_id: cleanEp,
            user_handle: cleanHandle,
            avatar_id: resolvedAvatar,
            content: cleanContent,
            likes_count: 0,
            user_liked: false,
            is_own: true,
            created_at: new Date().toISOString()
        };
        store[cleanEp] = [localComment, ...existingList];
        writeLocalCommentsStore(store);
        return { success: true, comment: localComment, synced: false };
    };

    if (!isSupabaseConfigured() || commentsBackendMissing) {
        return postLocalFallback();
    }

    const basePayload = {
        p_user_id: getOrCreateUserId(),
        p_client_token: getOrCreateUserToken(),
        p_episode_id: cleanEp,
        p_handle: cleanHandle,
        p_content: cleanContent
    };

    try {
        let response = await callSupabaseRpc(
            'post_episode_comment',
            avatarRpcParamUnsupported ? basePayload : { ...basePayload, p_avatar_id: resolvedAvatar }
        );

        if (!avatarRpcParamUnsupported && (response.status === 404 || response.status === 400)) {
            avatarRpcParamUnsupported = true;
            response = await callSupabaseRpc('post_episode_comment', basePayload);
        }

        if (response.status === 404) {
            commentsBackendMissing = true;
            console.info('Episode comments RPC not initialized on Supabase yet; stored comment locally.');
            return postLocalFallback();
        }

        if (!response.ok) {
            return { success: false, error: 'Unable to post comment right now. Please try again.' };
        }

        const data = await response.json();
        return { ...(data || { success: false }), synced: true };
    } catch (e) {
        return { success: false, error: 'Network error while posting comment. Please try again.' };
    }
}

/**
 * Save selected Gokuldham character avatar locally and sync via set_user_avatar RPC.
 */
export async function saveUserAvatarToCloud(avatarId) {
    const cleanAvatar = normalizeAvatarId(avatarId);
    if (!isSupabaseConfigured()) {
        return { success: true, avatar_id: cleanAvatar, synced: false };
    }

    try {
        const response = await callSupabaseRpc('set_user_avatar', {
            p_user_id: getOrCreateUserId(),
            p_client_token: getOrCreateUserToken(),
            p_avatar_id: cleanAvatar
        });

        if (response.status === 404) {
            console.info('set_user_avatar RPC not initialized on Supabase yet; stored avatar locally.');
            return { success: true, avatar_id: cleanAvatar, synced: false };
        }

        if (!response.ok) {
            return { success: false, avatar_id: cleanAvatar, synced: false };
        }

        const data = await response.json();
        return { ...(data || { success: true, avatar_id: cleanAvatar }), synced: true };
    } catch (e) {
        return { success: true, avatar_id: cleanAvatar, synced: false };
    }
}

/**
 * Toggle upvote on an episode comment.
 */
export async function toggleCommentLike(commentId) {
    const cleanId = String(commentId || '').trim();
    if (!cleanId) return { success: false, error: 'Invalid comment ID' };

    const toggleLocal = () => {
        const store = readLocalCommentsStore();
        for (const epId of Object.keys(store)) {
            const arr = store[epId];
            if (!Array.isArray(arr)) continue;
            const target = arr.find(c => c.id === cleanId);
            if (target) {
                target.user_liked = !target.user_liked;
                target.likes_count = Math.max(0, (Number(target.likes_count) || 0) + (target.user_liked ? 1 : -1));
                writeLocalCommentsStore(store);
                return { success: true, comment_id: cleanId, likes_count: target.likes_count, user_liked: target.user_liked, synced: false };
            }
        }
        return { success: false, error: 'Comment not found' };
    };

    if (cleanId.startsWith('local_') || !isSupabaseConfigured() || commentsBackendMissing) {
        return toggleLocal();
    }

    try {
        const response = await callSupabaseRpc('toggle_comment_like', {
            p_user_id: getOrCreateUserId(),
            p_client_token: getOrCreateUserToken(),
            p_comment_id: cleanId
        });

        if (response.status === 404) {
            commentsBackendMissing = true;
            return toggleLocal();
        }

        if (!response.ok) return { success: false, error: 'Failed to update comment like' };
        const data = await response.json();
        return { ...(data || { success: false }), synced: true };
    } catch (e) {
        return { success: false, error: 'Network error while updating like' };
    }
}

/**
 * Delete own comment from an episode.
 */
export async function deleteEpisodeComment(commentId) {
    const cleanId = String(commentId || '').trim();
    if (!cleanId) return { success: false, error: 'Invalid comment ID' };

    const deleteLocal = () => {
        const store = readLocalCommentsStore();
        for (const epId of Object.keys(store)) {
            const arr = store[epId];
            if (!Array.isArray(arr)) continue;
            const next = arr.filter(c => c.id !== cleanId);
            if (next.length !== arr.length) {
                store[epId] = next;
                writeLocalCommentsStore(store);
                return { success: true, deleted_id: cleanId, synced: false };
            }
        }
        return { success: false, error: 'Comment not found' };
    };

    if (cleanId.startsWith('local_') || !isSupabaseConfigured() || commentsBackendMissing) {
        return deleteLocal();
    }

    try {
        const response = await callSupabaseRpc('delete_episode_comment', {
            p_user_id: getOrCreateUserId(),
            p_client_token: getOrCreateUserToken(),
            p_comment_id: cleanId
        });

        if (response.status === 404) {
            commentsBackendMissing = true;
            return deleteLocal();
        }

        if (!response.ok) return { success: false, error: 'Failed to delete comment' };
        const data = await response.json();
        return { ...(data || { success: false }), synced: true };
    } catch (e) {
        return { success: false, error: 'Network error while deleting comment' };
    }
}

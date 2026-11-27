/**
 * Supabase client and sync module for Daily Dose of TMKOC Global Leaderboard.
 * 100% Serverless, $0/month, powered by Supabase REST API.
 * Uses native fetch for zero latency and zero CDN dependency.
 */

export const SUPABASE_CONFIG = {
    url: 'https://rxubsmawvuigofveqyza.supabase.co',
    anonKey: 'sb_publishable_xbOMi4flq-JXLJNzkkoypA_ADaz12T0'
};

const STORAGE_USER_ID = 'tmkoc_user_uuid';
const STORAGE_USER_TOKEN = 'tmkoc_user_token';
const STORAGE_LOCAL_REACTIONS = 'tmkoc_episode_reactions';

let reactionsBackendMissing = false;
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
export async function syncUserToCloud({ handle, watchedCount, watchHours, fanTier }) {
    if (!isSupabaseConfigured()) return { success: false, reason: 'unconfigured' };

    const userId = getOrCreateUserId();
    const clientToken = getOrCreateUserToken();
    const cleanHandle = (handle || '@TMKOCSuperfan').trim();

    // Guard against syncing a duplicate handle if taken by someone else
    if (!cleanHandle.startsWith('Gokuldham resident') && cleanHandle !== '@TMKOCSuperfan') {
        const taken = await isHandleTaken(cleanHandle, userId, Number(watchedCount) || 0);
        if (taken) {
            console.warn(`Cannot sync: handle "${cleanHandle}" is already taken by another user.`);
            return { success: false, reason: 'handle_taken' };
        }
    }

    const cleanBaseUrl = getCleanBaseUrl();

    try {
        const response = await fetch(`${cleanBaseUrl}/rest/v1/rpc/sync_fan_stats`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_client_token: clientToken,
                p_handle: cleanHandle,
                p_watched_count: Math.max(0, Math.min(5000, Number(watchedCount) || 0)),
                p_watch_hours: Math.max(0, Math.min(2500, Number(watchHours) || 0)),
                p_fan_tier: fanTier || 'Gokuldham Resident'
            })
        });

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
        const response = await fetch(
            `${cleanBaseUrl}/rest/v1/leaderboard?select=user_id,handle,watched_count,watch_hours,fan_tier,updated_at&order=watched_count.desc,watch_hours.desc&limit=${limit}`,
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

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

/**
 * Upsert current user's statistics to Supabase via standard REST API
 */
export async function syncUserToCloud({ handle, watchedCount, watchHours, fanTier }) {
    if (!isSupabaseConfigured()) return { success: false, reason: 'unconfigured' };

    const userId = getOrCreateUserId();
    const cleanHandle = (handle || '@TMKOCSuperfan').trim();
    const cleanBaseUrl = getCleanBaseUrl();

    try {
        const response = await fetch(`${cleanBaseUrl}/rest/v1/leaderboard`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                user_id: userId,
                handle: cleanHandle,
                watched_count: Number(watchedCount) || 0,
                watch_hours: Number(watchHours) || 0,
                fan_tier: fanTier || 'Gokuldham Resident',
                updated_at: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.warn('Leaderboard sync returned HTTP status:', response.status, errText);
            return { success: false, error: errText };
        }

        return { success: true };
    } catch (err) {
        console.warn('Network error syncing stats:', err);
        return { success: false, error: err.message };
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
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            console.warn('Leaderboard fetch returned HTTP status:', response.status);
            return null;
        }

        const data = await response.json();
        const myUserId = getOrCreateUserId();

        return (data || []).map((row, index) => ({
            rank: (index + 1).toString(),
            handle: row.handle,
            count: Number(row.watched_count) || 0,
            hours: Math.floor(Number(row.watch_hours) || 0),
            level: row.fan_tier,
            isUser: row.user_id === myUserId
        }));
    } catch (err) {
        console.warn('Failed to fetch leaderboard:', err);
        return null;
    }
}

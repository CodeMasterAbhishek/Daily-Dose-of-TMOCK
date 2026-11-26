/**
 * UI module for DailyDose TMKOC, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */
import { syncUserToCloud, fetchGlobalLeaderboard, fetchUserGlobalRank, isSupabaseConfigured, getOrCreateUserId, reportDeadLinkToCloud, fetchKnownDeadLinks } from './supabase.js';

function escapeHTML(str) {
    if (str == null) return '';
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
        }
    });
}

function formatWatchTime(decimalHours) {
    const totalSeconds = Math.round(decimalHours * 3600);
    if (totalSeconds === 0) return '0s';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    let parts = [];
    if (h > 0) {
        parts.push(`${h}h`);
        parts.push(`${m}m`);
        parts.push(`${s}s`);
    } else if (m > 0) {
        parts.push(`${m}m`);
        parts.push(`${s}s`);
    } else {
        parts.push(`${s}s`);
    }
    return parts.join(' ');
}

let allArticlesMap = {};
let masterEpNumberMap = {};
let currentModalEpNum = null;

// LocalStorage Keys
const STORAGE_COMPLETED = 'tmkoc_completed_watched_eps'; // Only >= 90% completed full episodes
const STORAGE_COMPLETED_SHORTS = 'tmkoc_completed_shorts'; // Only >= 90% completed short clips
const STORAGE_TIMESTAMPS = 'tmkoc_timestamps';
const STORAGE_EXACT_WATCH_SECONDS = 'tmkoc_exact_watch_seconds';
const STORAGE_HANDLE = 'tmkoc_user_handle';
const STORAGE_STREAK = 'tmkoc_streak_data';
const STORAGE_ACTIVITY = 'tmkoc_activity_log';
const STORAGE_LAST_OPENED = 'tmkoc_last_opened';

let activeWatchTrackerTimer = null;
let currentActiveEpId = null;
let currentModalArticle = null;
window.userIsIndia = false;
let ytPlayer = null;
let bgKeepAliveAudio = null;

function ensureBackgroundAudioKeepAlive() {
    try {
        if (!bgKeepAliveAudio) {
            bgKeepAliveAudio = document.createElement('audio');
            bgKeepAliveAudio.id = 'tmkoc-bg-keepalive';
            bgKeepAliveAudio.loop = true;
            bgKeepAliveAudio.volume = 0.001; // Low volume audible stream to exempt tab from background freezing
            bgKeepAliveAudio.src = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
            document.body.appendChild(bgKeepAliveAudio);
        }
        if (bgKeepAliveAudio.paused) {
            bgKeepAliveAudio.play().catch(() => {});
        }
    } catch(e) {}
}

function stopBackgroundAudioKeepAlive() {
    try {
        if (bgKeepAliveAudio && !bgKeepAliveAudio.paused) {
            bgKeepAliveAudio.pause();
        }
    } catch(e) {}
}

function updateMediaSession(article) {
    if (!('mediaSession' in navigator)) return;
    try {
        if (window.MediaMetadata) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: `EP ${article.epNumber}: ${article.title}`,
                artist: 'Taarak Mehta Ka Ooltah Chashmah',
                album: 'Daily Dose of TMKOC',
                artwork: [
                    { src: article.image || 'assets/default_thumb.jpg', sizes: '512x512', type: 'image/jpeg' }
                ]
            });
        }
        navigator.mediaSession.playbackState = 'playing';

        navigator.mediaSession.setActionHandler('play', () => {
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            window.navCleanEp(1);
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            window.navCleanEp(-1);
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (ytPlayer && typeof ytPlayer.seekTo === 'function' && details.seekTime !== undefined) {
                ytPlayer.seekTo(details.seekTime, true);
            }
        });
    } catch(e) {}
}

// Load YouTube IFrame API dynamically only if not already declared in index.html
if (!(window.YT && window.YT.Player) && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const ytScript = document.createElement('script');
    ytScript.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag) {
        firstScriptTag.parentNode.insertBefore(ytScript, firstScriptTag);
    } else {
        document.head.appendChild(ytScript);
    }
}

// --- Gentle Single-Worker Probe Pool & Geo-block Cache ---
const PROBE_POOL_SIZE = 1;
const MAX_LOW_PRIORITY_WORKERS = 1;
const probeWorkers = [];
const highPriorityQueue = [];
const lowPriorityQueue = [];
const inFlightProbes = new Map();
const reportedDeadVideoIds = new Set();
let checkObserver = null;
const verifiedVideos = new Set();

let isMainPlayerLoading = false;
let isMainPlayerReady = false;
let lastPlayerHadEndTime = false;
let pendingMainPlayerLoad = null;
let pendingAttachIframeSessionId = null;
let mainLoadingTimeout = null;
let jsapiWatchdogTimer = null;
let adjPrecheckTimer = null;
let probeDrainTimer = null;
let initialProbeUnlockTime = Date.now() + 2500;
let playbackSessionId = 0;
let currentResumeSeconds = 0;
let currentCandidates = [];
let currentActiveCandidate = null;
let currentPlayingVideoId = '';
let sessionTriedVideoIds = new Set();

function getEpisodeCandidates(article) {
    if (!article) return [];
    const seen = new Set();
    const list = [];
    const add = (videoId, tier) => {
        if (videoId && !seen.has(videoId)) {
            seen.add(videoId);
            list.push({ videoId, tier });
        }
    };
    add(article.videoId, 'main');
    if (Array.isArray(article.robustFallbacks)) {
        article.robustFallbacks.forEach(id => add(id, 'backup'));
    }
    if (Array.isArray(article.robustShorts)) {
        article.robustShorts.forEach(id => add(id, 'short'));
    }
    return list;
}

function isVideoKnownUnavailable(videoId, cache = getCheckerCache()) {
    return Boolean(videoId && cache[videoId] && cache[videoId].isUnavailable === true);
}

function isVideoKnownAvailable(videoId, cache = getCheckerCache()) {
    return Boolean(videoId && cache[videoId] && cache[videoId].isUnavailable === false);
}

function getArticleAvailabilityState(article, cache = getCheckerCache()) {
    const candidates = getEpisodeCandidates(article);
    if (candidates.length === 0) {
        return { allUnavailable: false, isFallbackShort: false };
    }
    const hasPlayableFull = candidates.some(c => c.tier !== 'short' && !isVideoKnownUnavailable(c.videoId, cache));
    const hasPlayableShort = candidates.some(c => c.tier === 'short' && !isVideoKnownUnavailable(c.videoId, cache));
    return {
        allUnavailable: !hasPlayableFull && !hasPlayableShort,
        isFallbackShort: !hasPlayableFull && hasPlayableShort
    };
}

function updateCardElementStatus(article) {
    if (!article) return;
    try {
        const card = document.querySelector(`.card[data-id="${article.id}"]`);
        if (!card) return;
        const { allUnavailable, isFallbackShort } = getArticleAvailabilityState(article);
        card.classList.toggle('ep-unavailable', allUnavailable);
        const durationBadge = card.querySelector('.card-duration-badge');
        if (durationBadge) {
            durationBadge.innerHTML = getDurationBadgeHTML(article, isFallbackShort) || '21:45';
        }
    } catch (e) {}
}

export function refreshAllRenderedCards() {
    try {
        const cache = getCheckerCache();
        document.querySelectorAll('.card[data-id]').forEach(card => {
            const id = card.getAttribute('data-id');
            const article = allArticlesMap[id];
            if (!article) return;
            const { allUnavailable, isFallbackShort } = getArticleAvailabilityState(article, cache);
            card.classList.toggle('ep-unavailable', allUnavailable);
            const durationBadge = card.querySelector('.card-duration-badge');
            if (durationBadge) {
                durationBadge.innerHTML = getDurationBadgeHTML(article, isFallbackShort) || '21:45';
            }
        });
    } catch (e) {}
}

function createProbeWorker(id) {
    return {
        id,
        player: null,
        wrapperEl: null,
        ready: false,
        busy: false,
        priority: null,
        currentVideoId: null,
        timer: null,
        jobToken: 0
    };
}

function destroyProbeWorker(worker) {
    if (worker.timer) {
        clearTimeout(worker.timer);
        worker.timer = null;
    }
    try { if (worker.player && typeof worker.player.destroy === 'function') worker.player.destroy(); } catch (e) {}
    try {
        if (worker.wrapperEl && worker.wrapperEl.parentNode) {
            worker.wrapperEl.parentNode.removeChild(worker.wrapperEl);
        }
    } catch (e) {}
    worker.player = null;
    worker.wrapperEl = null;
    worker.ready = false;
    worker.busy = false;
    worker.priority = null;
    worker.currentVideoId = null;
}

function hasPendingProbeWork() {
    if (highPriorityQueue.length > 0) return true;
    return !isMainPlayerLoading && !currentModalArticle && lowPriorityQueue.length > 0;
}

function preemptLowPriorityWorkersIfNeeded() {
    if (highPriorityQueue.length === 0) return;
    const idleCount = probeWorkers.filter(w => !w.busy).length;
    const canSpawn = probeWorkers.length < PROBE_POOL_SIZE;
    if (idleCount > 0 || canSpawn) return;

    let needed = highPriorityQueue.length;
    for (const worker of probeWorkers) {
        if (needed <= 0) break;
        if (worker.busy && worker.priority === 'low' && worker.ready && worker.currentVideoId) {
            const preemptedId = worker.currentVideoId;
            worker.jobToken += 1;
            if (worker.timer) {
                clearTimeout(worker.timer);
                worker.timer = null;
            }
            worker.busy = false;
            worker.priority = null;
            worker.currentVideoId = null;
            if (!lowPriorityQueue.includes(preemptedId)) {
                lowPriorityQueue.unshift(preemptedId);
            }
            needed -= 1;
        }
    }
}

function stopAllProbeWorkers() {
    if (probeDrainTimer) {
        clearTimeout(probeDrainTimer);
        probeDrainTimer = null;
    }
    while (highPriorityQueue.length > 0) {
        const droppedId = highPriorityQueue.shift();
        const entry = inFlightProbes.get(droppedId);
        if (entry && !probeWorkers.some(w => w.busy && w.currentVideoId === droppedId)) {
            inFlightProbes.delete(droppedId);
            entry.resolve(false);
        }
    }
    for (const worker of probeWorkers) {
        if (worker.busy && worker.currentVideoId) {
            const preemptedId = worker.currentVideoId;
            const prevPriority = worker.priority;
            worker.jobToken += 1;
            if (prevPriority === 'low') {
                if (!lowPriorityQueue.includes(preemptedId)) {
                    lowPriorityQueue.unshift(preemptedId);
                }
            } else {
                const entry = inFlightProbes.get(preemptedId);
                if (entry) {
                    inFlightProbes.delete(preemptedId);
                    entry.resolve(false);
                }
            }
            // Immediately destroy active probe iframes so in-flight YouTube/stream fetches abort right away
            destroyProbeWorker(worker);
            continue;
        }
        if (!worker.ready && worker.player) {
            worker.jobToken += 1;
            destroyProbeWorker(worker);
        } else if (worker.ready && worker.player && typeof worker.player.stopVideo === 'function') {
            try { worker.player.stopVideo(); } catch (e) {}
        }
    }
}

function finishWorkerJob(worker, expectedToken, isUnavailable, persist) {
    if (worker.jobToken !== expectedToken || !worker.busy) return;
    const videoId = worker.currentVideoId;
    if (worker.timer) {
        clearTimeout(worker.timer);
        worker.timer = null;
    }
    worker.busy = false;
    worker.priority = null;
    worker.currentVideoId = null;

    if (videoId) {
        if (persist) {
            setCheckerCache(videoId, isUnavailable);
        }

        const entry = inFlightProbes.get(videoId);
        if (entry) {
            inFlightProbes.delete(videoId);
            entry.resolve(isUnavailable);
        }
    }

    if (!worker.ready) {
        destroyProbeWorker(worker);
    } else if (!hasPendingProbeWork()) {
        try { worker.player.stopVideo(); } catch (e) {}
    }

    if (probeDrainTimer) clearTimeout(probeDrainTimer);
    const delay = highPriorityQueue.length > 0 ? 30 : 250;
    probeDrainTimer = setTimeout(() => {
        probeDrainTimer = null;
        drainProbeQueues();
    }, delay);
}

function runProbeOnWorker(worker, videoId, priority = 'low') {
    worker.busy = true;
    worker.priority = priority;
    worker.currentVideoId = videoId;
    worker.jobToken += 1;
    const token = worker.jobToken;

    if (!worker.player) {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.id = `bg-checker-wrapper-${worker.id}`;
        wrapperDiv.style.position = 'fixed';
        wrapperDiv.style.bottom = '0';
        wrapperDiv.style.right = '0';
        wrapperDiv.style.width = '1px';
        wrapperDiv.style.height = '1px';
        wrapperDiv.style.overflow = 'hidden';
        wrapperDiv.style.opacity = '0';
        wrapperDiv.style.zIndex = '-9999';
        wrapperDiv.style.pointerEvents = 'none';

        const playerEl = document.createElement('div');
        const playerDomId = `bg-checker-player-${worker.id}`;
        playerEl.id = playerDomId;
        wrapperDiv.appendChild(playerEl);
        document.body.appendChild(wrapperDiv);
        worker.wrapperEl = wrapperDiv;

        worker.timer = setTimeout(() => finishWorkerJob(worker, token, false, false), 4500);

        try {
            worker.player = new window.YT.Player(playerDomId, {
                height: '200',
                width: '200',
                videoId,
                playerVars: {
                    playsinline: 1,
                    controls: 0,
                    disablekb: 1,
                    rel: 0,
                    mute: 1,
                    autoplay: 1
                },
                events: {
                    'onReady': function() {
                        worker.ready = true;
                        try { worker.player.mute(); } catch (e) {}
                        if (worker.busy && worker.currentVideoId) {
                            const activeToken = worker.jobToken;
                            if (worker.timer) clearTimeout(worker.timer);
                            worker.timer = setTimeout(() => finishWorkerJob(worker, activeToken, false, false), 1500);
                        }
                    },
                    'onStateChange': function(event) {
                        if (!worker.busy || !worker.currentVideoId) return;
                        if (event.data === window.YT.PlayerState.PLAYING || event.data === window.YT.PlayerState.BUFFERING) {
                            try {
                                const vd = typeof worker.player.getVideoData === 'function' ? worker.player.getVideoData() : null;
                                if (vd && vd.video_id && vd.video_id !== worker.currentVideoId) return;
                            } catch (e) {}
                            finishWorkerJob(worker, worker.jobToken, false, true);
                        }
                    },
                    'onError': function() {
                        if (!worker.busy || !worker.currentVideoId) return;
                        try {
                            const vd = typeof worker.player.getVideoData === 'function' ? worker.player.getVideoData() : null;
                            if (vd && vd.video_id && vd.video_id !== worker.currentVideoId) return;
                        } catch (e) {}
                        finishWorkerJob(worker, worker.jobToken, true, true);
                    }
                }
            });
        } catch (e) {
            finishWorkerJob(worker, token, false, false);
        }
        return;
    }

    worker.timer = setTimeout(() => {
        try { worker.player.stopVideo(); } catch (e) {}
        finishWorkerJob(worker, token, false, false);
    }, 1800);

    try {
        worker.player.mute();
        worker.player.loadVideoById(videoId);
    } catch (e) {
        destroyProbeWorker(worker);
        finishWorkerJob(worker, token, false, false);
    }
}

function clearLowPriorityQueue() {
    while (lowPriorityQueue.length > 0) {
        const droppedId = lowPriorityQueue.shift();
        const entry = inFlightProbes.get(droppedId);
        if (entry && entry.priority !== 'high' && !probeWorkers.some(w => w.busy && w.currentVideoId === droppedId)) {
            inFlightProbes.delete(droppedId);
            entry.resolve(false);
        }
    }
}

function drainProbeQueues() {
    if (!window.YT || !window.YT.Player) return;

    preemptLowPriorityWorkersIfNeeded();

    while (true) {
        let nextVideoId = null;
        let nextPriority = 'low';

        if (highPriorityQueue.length > 0) {
            nextVideoId = highPriorityQueue[0];
            nextPriority = 'high';
        } else if (!isMainPlayerLoading && !currentModalArticle && lowPriorityQueue.length > 0) {
            if (Date.now() < initialProbeUnlockTime) {
                if (!probeDrainTimer) {
                    const waitMs = Math.max(50, initialProbeUnlockTime - Date.now() + 20);
                    probeDrainTimer = setTimeout(() => {
                        probeDrainTimer = null;
                        drainProbeQueues();
                    }, waitMs);
                }
                break;
            }
            const activeLowCount = probeWorkers.filter(w => w.busy && w.priority === 'low').length;
            if (activeLowCount >= MAX_LOW_PRIORITY_WORKERS) break;
            nextVideoId = lowPriorityQueue[0];
            nextPriority = 'low';
        } else {
            break;
        }

        let worker = probeWorkers.find(w => !w.busy);
        if (!worker && probeWorkers.length < PROBE_POOL_SIZE) {
            worker = createProbeWorker(probeWorkers.length);
            probeWorkers.push(worker);
        }
        if (!worker) break;

        if (nextPriority === 'high') {
            highPriorityQueue.shift();
        } else {
            lowPriorityQueue.shift();
        }

        if (!nextVideoId) continue;

        const cache = getCheckerCache();
        if (cache[nextVideoId]) {
            const entry = inFlightProbes.get(nextVideoId);
            if (entry) {
                inFlightProbes.delete(nextVideoId);
                entry.resolve(Boolean(cache[nextVideoId].isUnavailable));
            }
            continue;
        }

        runProbeOnWorker(worker, nextVideoId, nextPriority);
    }
}

function probeVideoId(videoId, priority = 'low') {
    if (!videoId) return Promise.resolve(true);

    const cache = getCheckerCache();
    if (cache[videoId]) {
        return Promise.resolve(Boolean(cache[videoId].isUnavailable));
    }

    if (inFlightProbes.has(videoId)) {
        const existing = inFlightProbes.get(videoId);
        if (priority === 'high' && existing.priority !== 'high') {
            existing.priority = 'high';
            const lowIdx = lowPriorityQueue.indexOf(videoId);
            if (lowIdx !== -1) lowPriorityQueue.splice(lowIdx, 1);
            if (!highPriorityQueue.includes(videoId) && !probeWorkers.some(w => w.busy && w.currentVideoId === videoId)) {
                highPriorityQueue.push(videoId);
                drainProbeQueues();
            }
        }
        return existing.promise;
    }

    let resolveFn;
    const promise = new Promise(resolve => {
        resolveFn = resolve;
    });

    inFlightProbes.set(videoId, { promise, resolve: resolveFn, priority });

    if (priority === 'high') {
        highPriorityQueue.push(videoId);
    } else {
        if (lowPriorityQueue.length >= 12) {
            const droppedId = lowPriorityQueue.shift();
            const droppedEntry = inFlightProbes.get(droppedId);
            if (droppedEntry) {
                inFlightProbes.delete(droppedId);
                droppedEntry.resolve(false);
            }
        }
        lowPriorityQueue.push(videoId);
    }

    drainProbeQueues();
    return promise;
}

async function resolveArticleLinks(article, priority = 'low', skipVideoId = null) {
    if (!article) return;
    const candidates = getEpisodeCandidates(article);
    if (candidates.length === 0) return;

    const mainCandidate = candidates.find(c => c.tier === 'main');
    if (mainCandidate && mainCandidate.videoId !== skipVideoId) {
        const mainUnavailable = await probeVideoId(mainCandidate.videoId, priority);
        updateCardElementStatus(article);
        if (!mainUnavailable) return;
    }

    const backups = candidates.filter(c => c.tier === 'backup' && c.videoId !== skipVideoId);
    if (backups.length > 0) {
        const backupResults = await Promise.all(backups.map(c => probeVideoId(c.videoId, priority)));
        updateCardElementStatus(article);
        if (backupResults.some(isUnavailable => !isUnavailable)) return;
    }

    const shorts = candidates.filter(c => c.tier === 'short' && c.videoId !== skipVideoId);
    if (shorts.length > 0) {
        await Promise.all(shorts.map(c => probeVideoId(c.videoId, priority)));
        updateCardElementStatus(article);
    }
}

function scheduleAdjacentPrecheck(epNumber, expectedSessionId) {
    if (adjPrecheckTimer) {
        clearTimeout(adjPrecheckTimer);
        adjPrecheckTimer = null;
    }
    const base = parseInt(epNumber, 10);
    if (isNaN(base)) return;
    adjPrecheckTimer = setTimeout(() => {
        adjPrecheckTimer = null;
        if (playbackSessionId !== expectedSessionId || !currentModalArticle || isMainPlayerLoading) return;
        const nextArt = masterEpNumberMap[base + 1] || allArticlesMap[`ep_${base + 1}`] || allArticlesMap[base + 1];
        if (nextArt && !verifiedVideos.has(nextArt.id)) {
            verifiedVideos.add(nextArt.id);
            resolveArticleLinks(nextArt, 'high', null).catch(() => {});
        }
    }, 1500);
}

function handleYouTubeApiAvailable() {
    if (!(window.YT && window.YT.Player)) return;
    if (pendingAttachIframeSessionId && pendingAttachIframeSessionId === playbackSessionId && currentModalArticle && !ytPlayer) {
        const directIframe = document.getElementById('clean-iframe');
        if (directIframe) {
            pendingAttachIframeSessionId = null;
            try {
                ytPlayer = new window.YT.Player('clean-iframe', {
                    events: createMainPlayerEvents(playbackSessionId)
                });
            } catch (e) {}
        }
    }
    drainProbeQueues();
}

const prevYtReady = window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady = function() {
    if (typeof prevYtReady === 'function') {
        try { prevYtReady(); } catch (e) {}
    }
    handleYouTubeApiAvailable();
};

if (window.YT && window.YT.Player) {
    setTimeout(handleYouTubeApiAvailable, 0);
}

export async function initializeIpCache() {
    const ipFetchPromise = (async () => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 2000) : null;
        try {
            const res = await fetch('https://api.ipify.org?format=json', controller ? { signal: controller.signal } : undefined);
            const data = await res.json();
            // Hash IP to detect VPN changes without storing raw PII
            const encoder = new TextEncoder();
            const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data.ip));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const ipHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const lastHash = localStorage.getItem("tmkoc_last_ip_hash");
            if (lastHash && lastHash !== ipHash) {
                // Network changed (VPN toggled). Invalidate the geo cache.
                localStorage.removeItem("tmkoc_checker_cache");
                memoryCheckerCache = null;
            }
            localStorage.setItem("tmkoc_last_ip_hash", ipHash);
            localStorage.removeItem("tmkoc_last_ip");
        } catch (e) {
        } finally {
            if (timer) clearTimeout(timer);
        }
    })();

    const deadLinksPromise = fetchKnownDeadLinks().catch(() => []);

    const [, deadVideoIds] = await Promise.all([ipFetchPromise, deadLinksPromise]);

    // Pre-populate known crowdsourced dead/blocked links from Supabase
    // so visitors instantly bypass known broken links without running background test players!
    try {
        if (deadVideoIds && deadVideoIds.length > 0) {
            const cache = getCheckerCache();
            const now = Date.now();
            let changed = false;
            deadVideoIds.forEach(vidId => {
                if (!cache[vidId] || !cache[vidId].isUnavailable) {
                    cache[vidId] = { isUnavailable: true, timestamp: now };
                    changed = true;
                }
            });
            if (changed) {
                memoryCheckerCache = cache;
                localStorage.setItem("tmkoc_checker_cache", JSON.stringify(cache));
            }
        }
    } catch (e) {}
}

let memoryCheckerCache = null;

function getCheckerCache() {
    if (memoryCheckerCache) return memoryCheckerCache;
    try {
        const cache = JSON.parse(localStorage.getItem("tmkoc_checker_cache") || "{}");
        const now = Date.now();
        let changed = false;
        for (const key in cache) {
            // 24-hour geo/availability cache TTL (86400000 ms)
            if (now - cache[key].timestamp > 86400000) {
                delete cache[key];
                changed = true;
            }
        }
        if (changed) {
            localStorage.setItem("tmkoc_checker_cache", JSON.stringify(cache));
        }
        memoryCheckerCache = cache;
        return cache;
    } catch(e) {
        return {};
    }
}

function setCheckerCache(videoId, isUnavailable) {
    if (!videoId) return;
    try {
        const cache = getCheckerCache();
        cache[videoId] = {
            isUnavailable: isUnavailable,
            timestamp: Date.now()
        };
        memoryCheckerCache = cache;
        localStorage.setItem("tmkoc_checker_cache", JSON.stringify(cache));
    } catch(e) {}
}

export function getDurationBadgeHTML(article, isFallbackShort = false) {
    const durText = article.durationText || '21:45';
    let secs = 1260;
    if (durText) {
        const parts = durText.split(':');
        if (parts.length === 3) secs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        else if (parts.length === 2) secs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    
    // An episode is considered a short version if:
    // 1. It is playing a fallback short (isFallbackShort = true)
    // 2. Its actual duration is under 15 minutes (secs < 900)
    const isShort = isFallbackShort || (secs > 0 && secs < 900);
    if (isShort) {
        const displayTime = (isFallbackShort && secs >= 900) ? '10:00' : durText;
        return `${displayTime} <span style="font-size: 8px; opacity: 0.8; margin-left: 2px;">(SHORT)</span>`;
    }
    return durText;
}

function initIntersectionObserver() {
    if (checkObserver) return;
    checkObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const id = card.getAttribute('data-id');
                const article = allArticlesMap[id];
                if (article && article.videoId) {
                    updateCardElementStatus(article);
                    if (!verifiedVideos.has(article.id)) {
                        verifiedVideos.add(article.id);
                        resolveArticleLinks(article, 'low', null).catch(() => {});
                    }
                }
                checkObserver.unobserve(card);
            }
        });
    }, { rootMargin: '200px' });
}

export function getCompletedWatchedList() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_COMPLETED) || '[]');
    } catch(e) {
        return [];
    }
}

export function getCompletedShortsList() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_COMPLETED_SHORTS) || '[]');
    } catch(e) {
        return [];
    }
}

function getExactWatchSeconds() {
    try {
        let secs = parseInt(localStorage.getItem(STORAGE_EXACT_WATCH_SECONDS) || '0');
        const completed = getCompletedWatchedList();
        const completedShorts = getCompletedShortsList();
        const minSecs = (completed.length * 1260 * 0.90) + (completedShorts.length * 600 * 0.90);
        if (secs < minSecs) {
            secs = Math.round(minSecs);
            localStorage.setItem(STORAGE_EXACT_WATCH_SECONDS, secs);
        }
        return secs;
    } catch(e) {
        return 0;
    }
}

function getTimestamps() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_TIMESTAMPS) || '{}');
    } catch(e) {
        return {};
    }
}

// ----------------------------------------------------
// STREAK & ACTIVITY TRACKING
// ----------------------------------------------------
function getStreakData() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_STREAK) || '{}');
    } catch(e) {
        return {};
    }
}

function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

function updateStreak() {
    const data = getStreakData();
    const today = getTodayDateStr();

    if (data.lastWatchDate === today) return data;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let currentStreak = data.currentStreak || 0;
    let longestStreak = data.longestStreak || 0;

    if (data.lastWatchDate === yesterdayStr) {
        currentStreak += 1;
    } else {
        currentStreak = 1;
    }

    if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
    }

    const updated = { currentStreak, longestStreak, lastWatchDate: today };
    localStorage.setItem(STORAGE_STREAK, JSON.stringify(updated));

    if (currentStreak > 1) {
        logActivity('streak', `${currentStreak} days in a row`);
    }

    return updated;
}

function logActivity(type, title, durationSecs = null) {
    try {
        const log = JSON.parse(localStorage.getItem(STORAGE_ACTIVITY) || '[]');
        if (log.length > 0 && log[0].type === type && log[0].title === title) {
            log[0].date = new Date().toISOString();
            if (durationSecs !== null) log[0].duration = durationSecs;
        } else {
            log.unshift({ type, title, date: new Date().toISOString(), duration: durationSecs });
            if (log.length > 20) log.length = 20;
        }
        localStorage.setItem(STORAGE_ACTIVITY, JSON.stringify(log));
    } catch(e) {}
}

function getRecentActivity(limit = 10) {
    try {
        const log = JSON.parse(localStorage.getItem(STORAGE_ACTIVITY) || '[]');
        return log.slice(0, limit);
    } catch(e) {
        return [];
    }
}

function getLastWatchedEpisode() {
    try {
        let lastId = localStorage.getItem(STORAGE_LAST_OPENED);
        if (!lastId) {
            const completed = getCompletedWatchedList();
            const completedShorts = getCompletedShortsList();
            if (completed.length > 0) {
                lastId = completed[completed.length - 1];
            } else if (completedShorts.length > 0) {
                lastId = completedShorts[completedShorts.length - 1];
            } else {
                return null;
            }
        }
        const article = allArticlesMap[lastId] || masterEpNumberMap[lastId];
        if (article) return { id: lastId, title: article.title, epNumber: article.epNumber };
        return { id: lastId, title: `Episode`, epNumber: lastId };
    } catch(e) {
        return null;
    }
}

function getRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export async function syncCurrentUserStats() {
    try {
        const completed = getCompletedWatchedList();
        const count = completed.length;
        const totalSecs = getExactWatchSeconds();
        const hours = totalSecs / 3600;
        const savedHandle = localStorage.getItem(STORAGE_HANDLE);

        // Only sync if user has actually watched episodes OR explicitly saved a handle
        if (count === 0 && totalSecs === 0 && !savedHandle) {
            return { success: false, reason: 'no_activity' };
        }

        let handle = savedHandle;
        if (!handle || !handle.trim()) {
            let nextUserNumber = 1;
            try {
                const lbData = await fetchGlobalLeaderboard(1);
                if (lbData && lbData.totalCount !== undefined) {
                    nextUserNumber = lbData.totalCount + 1;
                }
            } catch (e) {
                console.warn('Could not fetch count for default username');
            }
            handle = `Gokuldham resident ${nextUserNumber}`;
            localStorage.setItem(STORAGE_HANDLE, handle);
        } else {
            handle = handle.trim();
        }

        const level = getFanLevel(count);

        return await syncUserToCloud({
            handle,
            watchedCount: count,
            watchHours: hours,
            fanTier: level.title
        });
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function saveCompletedEpisode(id) {
    try {
        const completed = getCompletedWatchedList();
        if (!completed.includes(id)) {
            const prevLevel = getFanLevel(completed.length).title;
            completed.push(id);
            localStorage.setItem(STORAGE_COMPLETED, JSON.stringify(completed));

            // Track streak
            updateStreak();

            // Log activity
            const article = allArticlesMap[id] || masterEpNumberMap[id];
            const epTitle = article ? `Episode ${article.epNumber}` : `Episode`;
            logActivity('watch', epTitle);

            // Check fan level change
            const newLevel = getFanLevel(completed.length).title;
            if (newLevel !== prevLevel) {
                logActivity('level', newLevel);
            }

            syncCurrentUserStats();
        }
        const elements = document.querySelectorAll(`[data-id="${id}"]`);
        elements.forEach(el => {
            el.classList.remove('watched-clip-article', 'clip-watched-upgrade-article');
            el.classList.add('read-article', 'watched-article');
        });
    } catch(e) {}
}

function saveCompletedShort(id) {
    try {
        const completedShorts = getCompletedShortsList();
        if (!completedShorts.includes(id)) {
            completedShorts.push(id);
            localStorage.setItem(STORAGE_COMPLETED_SHORTS, JSON.stringify(completedShorts));

            // Track streak
            updateStreak();

            // Log activity
            const article = allArticlesMap[id] || masterEpNumberMap[id];
            const epTitle = article ? `Episode ${article.epNumber} (Clip)` : `Episode Clip`;
            logActivity('watch', epTitle);

            syncCurrentUserStats();
        }
        
        const completedFull = getCompletedWatchedList();
        if (!completedFull.includes(id)) {
            const elements = document.querySelectorAll(`[data-id="${id}"]`);
            elements.forEach(el => {
                el.classList.remove('watched-article', 'clip-watched-upgrade-article');
                el.classList.add('watched-clip-article');
            });
        }
    } catch(e) {}
}

window.playEpisode = function(id) {
    const article = allArticlesMap[id] || masterEpNumberMap[id];
    if (article) {
        openCleanPlayer(article);
    }
};

export function registerMasterArticles(articles) {
    articles.forEach(art => {
        allArticlesMap[art.id] = art;
        masterEpNumberMap[art.epNumber] = art;
    });
}

function createHeroHTML(articles) {
    if (!articles || articles.length === 0) return '';
    
    let slidesHTML = '';
    let dotsHTML = '';
    
    articles.forEach((article, index) => {
        allArticlesMap[article.id] = article;
        masterEpNumberMap[article.epNumber] = article;
        const imageUrl = article.image;
        const activeClass = index === 0 ? 'active' : '';
        
        let readClass = '';
        const completed = getCompletedWatchedList();
        const completedShorts = getCompletedShortsList();
        if (completed.includes(article.id)) {
            readClass = 'read-article watched-article';
        } else if (completedShorts.includes(article.id)) {
            readClass = 'watched-clip-article';
        }
        
        slidesHTML += `
            <article class="hero-slide ${activeClass} ${readClass}" data-index="${index}" data-category="${article.category.toLowerCase()}" data-id="${article.id}">
                <a href="javascript:void(0)" class="hero-img-wrap" onclick="playEpisode('${article.id}')">
                    <img src="${imageUrl}" alt="${escapeHTML(article.title)}" class="hero-img" onerror="this.src='https://via.placeholder.com/1280x720/18181b/818cf8?text=TMKOC+Episode'">
                    <div class="hero-overlay"></div>
                    <div class="hero-content">
                        <div class="hero-meta">
                            <span class="hero-category">${escapeHTML(article.category)}</span>
                            <span class="hero-source" style="background: var(--text-primary); color: var(--bg-primary); padding: 2px 8px; border-radius: 4px; font-weight: 800;">EP ${article.epNumber}</span>
                            <span>${escapeHTML(article.airDate) || ''}</span>
                        </div>
                        <h1 class="hero-title">${escapeHTML(article.title)}</h1>
                        <p class="hero-desc">${escapeHTML(article.description) || ''}</p>
                    </div>
                </a>
            </article>
        `;
        
        dotsHTML += `<button class="hero-dot ${activeClass}" aria-label="Go to slide ${index + 1}" data-slide="${index}"></button>`;
    });

    return `
        <div class="hero-slider">
            ${slidesHTML}
            <button class="hero-nav-btn prev" aria-label="Previous slide">
                <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" fill="currentColor"></path></svg>
            </button>
            <button class="hero-nav-btn next" aria-label="Next slide">
                <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="currentColor"></path></svg>
            </button>
            <div class="hero-nav">
                ${dotsHTML}
            </div>
        </div>
    `;
}

function createCardHTML(article, context = null) {
    allArticlesMap[article.id] = article;
    masterEpNumberMap[article.epNumber] = article;
    const imageUrl = article.image;
    
    let epSecs = 1260; // fallback 21 mins
    if (article.durationText) {
        const parts = article.durationText.split(':');
        if (parts.length === 3) epSecs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        else if (parts.length === 2) epSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    const isCurrentEpShort = epSecs < 900;
    
    let readClass = '';
    const completedSet = context ? context.completedSet : new Set(getCompletedWatchedList());
    const completedShortsSet = context && context.completedShortsSet ? context.completedShortsSet : new Set(getCompletedShortsList());
    
    if (completedSet.has(article.id)) {
        readClass = 'read-article watched-article';
    } else if (completedShortsSet.has(article.id)) {
        if (isCurrentEpShort) {
            readClass = 'watched-clip-article';
        } else {
            readClass = 'clip-watched-upgrade-article';
        }
    }
    
    const cache = context ? context.cache : getCheckerCache();
    const { allUnavailable, isFallbackShort } = getArticleAvailabilityState(article, cache);
    const unavailableClass = allUnavailable ? 'ep-unavailable' : '';
    
    const displayDuration = getDurationBadgeHTML(article, isFallbackShort);

    const timestamps = context ? context.timestamps : getTimestamps();
    let savedTimeSec = timestamps[article.id] || 0;
    
    // If the episode is now an upgraded full episode (> 15m), but user only completed the short clip,
    // don't show an awkward 50% bar from the short version; let them watch the full episode fresh.
    if (completedShortsSet.has(article.id) && !completedSet.has(article.id) && !isCurrentEpShort && savedTimeSec <= 720) {
        savedTimeSec = 0;
    }
    
    const progressPercent = savedTimeSec ? Math.min(100, Math.round((savedTimeSec / epSecs) * 100)) : 0;
    
    return `
        <article class="card ${readClass} ${unavailableClass}" data-id="${article.id}" data-category="${escapeHTML(article.category).toLowerCase()}">
            <a href="javascript:void(0)" class="card-img-wrap" onclick="playEpisode('${article.id}')">
                <img src="${imageUrl}" alt="${escapeHTML(article.title)}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Episode'">
                <span class="card-duration-badge">${displayDuration || '21:45'}</span>
                ${progressPercent > 0 ? `<div class="card-progress-container"><div class="card-progress-bar" style="width: ${progressPercent}%;"></div></div>` : ''}
            </a>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">EP ${article.epNumber}</span>
                    <span>•</span>
                    <span class="card-date">${escapeHTML(article.airDate) || ''}</span>
                </div>
                <h2 class="card-title">
                    <a href="javascript:void(0)" onclick="playEpisode('${article.id}')">${escapeHTML(article.title)}</a>
                </h2>
            </div>
        </article>
    `;
}

export function renderArticles(articles, containerId, append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!append) {
        container.innerHTML = '';
        clearLowPriorityQueue();
    }

    if (!container.dataset.hoverPrecheckAttached) {
        container.dataset.hoverPrecheckAttached = 'true';
        let lastHoveredCardId = null;
        let hoverPrecheckTimer = null;
        container.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.card[data-id]')) return;
            if (hoverPrecheckTimer) {
                clearTimeout(hoverPrecheckTimer);
                hoverPrecheckTimer = null;
            }
            initialProbeUnlockTime = Math.max(initialProbeUnlockTime, Date.now() + 2500);
            stopAllProbeWorkers();
        });
        container.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.card[data-id]');
            if (!card) return;
            const id = card.getAttribute('data-id');
            if (!id || id === lastHoveredCardId) return;
            lastHoveredCardId = id;
            if (hoverPrecheckTimer) clearTimeout(hoverPrecheckTimer);
            hoverPrecheckTimer = setTimeout(() => {
                hoverPrecheckTimer = null;
                if (currentModalArticle || isMainPlayerLoading) return;
                const article = allArticlesMap[id];
                if (article && article.videoId) {
                    verifiedVideos.add(article.id);
                    resolveArticleLinks(article, 'high', null).catch(() => {});
                }
            }, 450);
        });
        container.addEventListener('mouseleave', () => {
            lastHoveredCardId = null;
            if (hoverPrecheckTimer) {
                clearTimeout(hoverPrecheckTimer);
                hoverPrecheckTimer = null;
            }
        });
    }

    if (articles.length === 0 && !append) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No episodes found matching your search.</div>';
        return;
    }

    initIntersectionObserver();

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    const completedSet = new Set(getCompletedWatchedList());
    const completedShortsSet = new Set(getCompletedShortsList());
    const cache = getCheckerCache();
    const timestamps = getTimestamps();
    const context = { completedSet, completedShortsSet, cache, timestamps };

    articles.forEach(article => {
        tempDiv.innerHTML = createCardHTML(article, context);
        const cardElem = tempDiv.firstElementChild;
        fragment.appendChild(cardElem);
        if (checkObserver) checkObserver.observe(cardElem);
    });

    container.appendChild(fragment);
}

let heroAutoTimer = null;

function setupHeroSlider() {
    if (heroAutoTimer) clearInterval(heroAutoTimer);
    const slider = document.querySelector('.hero-slider');
    if (!slider) return;

    const slides = slider.querySelectorAll('.hero-slide');
    const dots = slider.querySelectorAll('.hero-dot');
    const prevBtn = slider.querySelector('.hero-nav-btn.prev');
    const nextBtn = slider.querySelector('.hero-nav-btn.next');

    if (slides.length <= 1) return;

    let currentIndex = 0;

    function goToSlide(index) {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        currentIndex = (index + slides.length) % slides.length;

        slides[currentIndex].classList.add('active');
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
    }

    function startAutoSlide() {
        stopAutoSlide();
        heroAutoTimer = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, 6000);
    }

    function stopAutoSlide() {
        if (heroAutoTimer) clearInterval(heroAutoTimer);
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            goToSlide(currentIndex - 1);
            startAutoSlide();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            goToSlide(currentIndex + 1);
            startAutoSlide();
        });
    }

    dots.forEach((dot, i) => {
        dot.addEventListener('click', (e) => {
            e.preventDefault();
            goToSlide(i);
            startAutoSlide();
        });
    });

    startAutoSlide();
}

export function renderHeroContainer(articles, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!articles || articles.length === 0) {
        container.innerHTML = '';
        return;
    }

    const featured = articles.slice(0, 4);
    container.innerHTML = createHeroHTML(featured);
    setupHeroSlider();
}

// ----------------------------------------------------
// STRICT WATCHED ENGINE (>= 90% COMPLETION & EXACT SECONDS)
// ----------------------------------------------------
let flushTimer = null;
let pendingExactWatchSeconds = null;
let pendingTimestamps = null;

function flushWatchTracker() {
    if (pendingExactWatchSeconds !== null) {
        localStorage.setItem(STORAGE_EXACT_WATCH_SECONDS, pendingExactWatchSeconds.toString());
        pendingExactWatchSeconds = null;
    }
    if (pendingTimestamps !== null) {
        localStorage.setItem(STORAGE_TIMESTAMPS, JSON.stringify(pendingTimestamps));
        
        if (currentActiveEpId && currentModalEpNum) {
            let secs = pendingTimestamps[currentActiveEpId] || 0;
            logActivity('watch', `Episode ${currentModalEpNum}`, secs);
        }
        
        pendingTimestamps = null;
    }
}

window.addEventListener('beforeunload', flushWatchTracker);

function startActiveWatchTracker(articleId) {
    stopActiveWatchTracker();
    currentActiveEpId = articleId;

    let totalSecs = getExactWatchSeconds();
    let timestamps = getTimestamps();
    let currentEpSecs = timestamps[articleId] || 0;

    activeWatchTrackerTimer = setInterval(() => {
        if (typeof ytPlayer !== 'undefined' && ytPlayer && typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING) {
            totalSecs += 1; // Global Fan Dashboard watch time
            
            // Sync to exactly where they are in the video (absolute time)
            if (typeof ytPlayer.getCurrentTime === 'function') {
                currentEpSecs = Math.floor(ytPlayer.getCurrentTime());
            } else {
                currentEpSecs += 1;
            }
            
            pendingExactWatchSeconds = totalSecs;
            
            timestamps[articleId] = currentEpSecs;
            pendingTimestamps = timestamps;

            let totalEpSecs = 1260; // fallback to 21 mins
            let segmentOffset = 0;
            
            const currentArticle = allArticlesMap[articleId] || masterEpNumberMap[articleId] || (currentModalEpNum ? masterEpNumberMap[currentModalEpNum] : null);
            if (currentArticle && currentArticle.startTime) {
                segmentOffset = currentArticle.startTime;
                if (currentArticle.endTime) {
                    totalEpSecs = currentArticle.endTime - currentArticle.startTime;
                }
            } else if (typeof ytPlayer.getDuration === 'function') {
                const duration = ytPlayer.getDuration();
                if (duration > 0) totalEpSecs = duration;
            }
            
            const effectiveWatchedSecs = currentEpSecs - segmentOffset;
            if (effectiveWatchedSecs >= totalEpSecs * 0.90) {
                if (totalEpSecs < 900) {
                    saveCompletedShort(articleId);
                } else {
                    saveCompletedEpisode(articleId);
                }
            }
        }
    }, 1000);
    
    flushTimer = setInterval(flushWatchTracker, 15000);
}

function stopActiveWatchTracker() {
    if (activeWatchTrackerTimer) {
        clearInterval(activeWatchTrackerTimer);
        activeWatchTrackerTimer = null;
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
        flushWatchTracker();
        syncCurrentUserStats();
    }
}

function getWarningBannerForTier(tier) {
    if (tier === 'backup') {
        return `⚠️ <strong>Note:</strong> Playing from an alternate source.`;
    }
    if (tier === 'short') {
        return `⚠️ <strong>Disclaimer:</strong> Full episode is unavailable in your country. Switched to short version.`;
    }
    return '';
}

function getBestStartCandidate(candidates) {
    if (!candidates || candidates.length === 0) return null;
    const cache = getCheckerCache();
    const confirmedBackupOrMain = candidates.find(c => c.tier !== 'short' && isVideoKnownAvailable(c.videoId, cache));
    if (confirmedBackupOrMain && (candidates[0].videoId === confirmedBackupOrMain.videoId || isVideoKnownUnavailable(candidates[0].videoId, cache))) {
        return confirmedBackupOrMain;
    }
    const firstPlayable = candidates.find(c => !isVideoKnownUnavailable(c.videoId, cache));
    return firstPlayable || candidates[0];
}

function pickNextFallbackCandidate(candidates, triedSet) {
    const cache = getCheckerCache();
    const remaining = candidates.filter(c => !triedSet.has(c.videoId) && !isVideoKnownUnavailable(c.videoId, cache));
    if (remaining.length === 0) return null;

    const confirmedBackup = remaining.find(c => c.tier === 'backup' && isVideoKnownAvailable(c.videoId, cache));
    if (confirmedBackup) return confirmedBackup;

    const nextBackup = remaining.find(c => c.tier === 'backup');
    if (nextBackup) return nextBackup;

    const confirmedShort = remaining.find(c => c.tier === 'short' && isVideoKnownAvailable(c.videoId, cache));
    if (confirmedShort) return confirmedShort;

    return remaining[0];
}

function buildLoadOptions(candidate, resumeSecs, article) {
    let startSeconds = resumeSecs || 0;
    if (candidate.tier === 'short' && startSeconds >= 540) {
        startSeconds = 0;
    }
    if (candidate.tier === 'main' && article) {
        if (article.startTime && startSeconds < article.startTime) startSeconds = article.startTime;
        if (article.endTime && startSeconds > article.endTime) startSeconds = article.startTime;
    }
    const opts = {
        videoId: candidate.videoId,
        startSeconds
    };
    if (candidate.tier === 'main' && article && article.endTime) {
        opts.endSeconds = article.endTime;
    }
    return opts;
}

function getCleanIframeElement() {
    const viewport = document.querySelector('.tmkoc-video-viewport');
    if (!viewport) return null;
    let iframeEl = null;
    if (ytPlayer && typeof ytPlayer.getIframe === 'function') {
        try { iframeEl = ytPlayer.getIframe(); } catch (e) {}
    }
    if (!iframeEl) {
        iframeEl = viewport.querySelector('#clean-iframe-container');
    }
    return iframeEl;
}

function setModalWarningBanner(htmlMsg) {
    const modalWarning = document.getElementById('clean-modal-warning');
    if (!modalWarning) return;
    if (htmlMsg) {
        modalWarning.style.display = 'block';
        modalWarning.innerHTML = htmlMsg;
    } else {
        modalWarning.style.display = 'none';
        modalWarning.innerHTML = '';
    }
}

function createMainPlayerEvents(activeSessionId) {
    return {
        'onReady': function() {
            if (playbackSessionId !== activeSessionId) return;
            if (jsapiWatchdogTimer) {
                clearTimeout(jsapiWatchdogTimer);
                jsapiWatchdogTimer = null;
            }
            isMainPlayerReady = true;
            if (!currentModalArticle) {
                try { ytPlayer.stopVideo(); } catch (e) {}
                return;
            }
            if (pendingMainPlayerLoad) {
                const queued = pendingMainPlayerLoad;
                pendingMainPlayerLoad = null;
                try {
                    ytPlayer.loadVideoById(queued);
                } catch (e) {
                    ytPlayer.loadVideoById(queued.videoId, queued.startSeconds);
                }
                try { ytPlayer.playVideo(); } catch (e) {}
            }
            try {
                if (typeof ytPlayer.getPlayerState === 'function' && ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING) {
                    isMainPlayerLoading = false;
                    if (mainLoadingTimeout) {
                        clearTimeout(mainLoadingTimeout);
                        mainLoadingTimeout = null;
                    }
                    if (currentPlayingVideoId) {
                        setCheckerCache(currentPlayingVideoId, false);
                        updateCardElementStatus(currentModalArticle);
                    }
                    verifiedVideos.add(currentModalArticle.id);
                    scheduleAdjacentPrecheck(currentModalArticle.epNumber, activeSessionId);
                }
            } catch (e) {}
            updateMediaSession(currentModalArticle);
        },
        'onError': function(event) {
            if (playbackSessionId !== activeSessionId) return;
            if (jsapiWatchdogTimer) {
                clearTimeout(jsapiWatchdogTimer);
                jsapiWatchdogTimer = null;
            }
            const currentArt = currentModalArticle;
            if (!currentArt) return;

            try {
                const vd = typeof ytPlayer.getVideoData === 'function' ? ytPlayer.getVideoData() : null;
                if (vd && vd.video_id && currentPlayingVideoId && vd.video_id !== currentPlayingVideoId) {
                    return;
                }
            } catch (e) {}

            const errCode = event.data;
            if (errCode === 150 || errCode === 101 || errCode === 100 || errCode === 2 || errCode === 5) {
                const failedVideoId = currentPlayingVideoId || currentArt.videoId;
                const failedTier = currentActiveCandidate ? currentActiveCandidate.tier : 'main';

                if (failedVideoId) {
                    setCheckerCache(failedVideoId, true);
                    updateCardElementStatus(currentArt);
                    if ((failedTier === 'main' || failedTier === 'backup') && !reportedDeadVideoIds.has(failedVideoId)) {
                        reportedDeadVideoIds.add(failedVideoId);
                        reportDeadLinkToCloud(currentArt.epNumber, failedVideoId).catch(() => {});
                    }
                }

                const nextCandidate = pickNextFallbackCandidate(currentCandidates, sessionTriedVideoIds);
                if (nextCandidate) {
                    sessionTriedVideoIds.add(nextCandidate.videoId);
                    currentActiveCandidate = nextCandidate;
                    currentPlayingVideoId = nextCandidate.videoId;
                    setModalWarningBanner(getWarningBannerForTier(nextCandidate.tier));

                    const remainingAfterNext = currentCandidates.filter(c => !sessionTriedVideoIds.has(c.videoId) && !isVideoKnownUnavailable(c.videoId));
                    if (remainingAfterNext.length > 0) {
                        resolveArticleLinks(currentArt, 'high', nextCandidate.videoId).catch(() => {});
                    }

                    const nextOpts = buildLoadOptions(nextCandidate, currentResumeSeconds, currentArt);
                    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                        try {
                            ytPlayer.loadVideoById(nextOpts);
                        } catch (err) {
                            ytPlayer.loadVideoById(nextOpts.videoId, nextOpts.startSeconds);
                        }
                        try { ytPlayer.playVideo(); } catch (e) {}
                    }
                    return;
                }
            }

            renderAllSourcesFailedFallback(currentArt);
        },
        'onStateChange': function(event) {
            if (playbackSessionId !== activeSessionId) return;
            if (event.data !== -1 && jsapiWatchdogTimer) {
                clearTimeout(jsapiWatchdogTimer);
                jsapiWatchdogTimer = null;
            }
            const currentArt = currentModalArticle;
            if (!currentArt) {
                if (event.data === window.YT.PlayerState.PLAYING || event.data === window.YT.PlayerState.BUFFERING) {
                    try { ytPlayer.stopVideo(); } catch (e) {}
                }
                return;
            }

            if (event.data === window.YT.PlayerState.PLAYING) {
                isMainPlayerLoading = false;
                if (mainLoadingTimeout) {
                    clearTimeout(mainLoadingTimeout);
                    mainLoadingTimeout = null;
                }
                if (currentPlayingVideoId) {
                    setCheckerCache(currentPlayingVideoId, false);
                    updateCardElementStatus(currentArt);
                }
                verifiedVideos.add(currentArt.id);
                scheduleAdjacentPrecheck(currentArt.epNumber, activeSessionId);
                drainProbeQueues();

                currentActiveEpId = currentArt.id;
                if ('mediaSession' in navigator) {
                    try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
                }
            } else if (event.data === window.YT.PlayerState.CUED) {
                isMainPlayerLoading = false;
                if (mainLoadingTimeout) {
                    clearTimeout(mainLoadingTimeout);
                    mainLoadingTimeout = null;
                }
                drainProbeQueues();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
                isMainPlayerLoading = false;
                drainProbeQueues();
                if ('mediaSession' in navigator) {
                    try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {}
                }
            } else if (event.data === window.YT.PlayerState.ENDED) {
                let isShort = currentActiveCandidate && currentActiveCandidate.tier === 'short';
                try {
                    const dur = (ytPlayer && typeof ytPlayer.getDuration === 'function') ? ytPlayer.getDuration() : 0;
                    if (dur > 0 && dur < 900) isShort = true;
                    else if (!isShort && currentArt.durationText) {
                        const parts = currentArt.durationText.split(':');
                        const secs = parts.length === 3 ? parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10) : (parts.length === 2 ? parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) : 1260);
                        if (secs < 900) isShort = true;
                    }
                } catch (e) {}
                if (isShort) {
                    saveCompletedShort(currentArt.id);
                } else {
                    saveCompletedEpisode(currentArt.id);
                }
                flushWatchTracker();
                if (localStorage.getItem('autoplayNext') !== 'false') {
                    window.navCleanEp(1);
                }
            }
        }
    };
}

function renderDirectIframeFallback(viewport, chosenCandidate, resumeSeconds, article, activeSessionId = playbackSessionId) {
    if (!viewport) return;
    isMainPlayerLoading = false;
    if (mainLoadingTimeout) {
        clearTimeout(mainLoadingTimeout);
        mainLoadingTimeout = null;
    }
    if (jsapiWatchdogTimer) {
        clearTimeout(jsapiWatchdogTimer);
        jsapiWatchdogTimer = null;
    }
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch (e) {}
        ytPlayer = null;
        isMainPlayerReady = false;
    }

    if (chosenCandidate) {
        const opts = buildLoadOptions(chosenCandidate, resumeSeconds, article);
        const sParam = opts.startSeconds > 0 ? `&start=${opts.startSeconds}` : '';
        const eParam = opts.endSeconds ? `&end=${opts.endSeconds}` : '';
        const originParam = window.location.protocol.startsWith('http')
            ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
            : '';
        pendingAttachIframeSessionId = originParam ? activeSessionId : null;
        viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed/${opts.videoId}?autoplay=1&rel=0&controls=1&modestbranding=1&iv_load_policy=3&color=white&playsinline=1${originParam}${sParam}${eParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        if (window.YT && window.YT.Player && pendingAttachIframeSessionId === activeSessionId) {
            handleYouTubeApiAvailable();
        }
    } else {
        pendingAttachIframeSessionId = null;
        viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
}

function renderAllSourcesFailedFallback(article) {
    isMainPlayerLoading = false;
    pendingMainPlayerLoad = null;
    if (mainLoadingTimeout) {
        clearTimeout(mainLoadingTimeout);
        mainLoadingTimeout = null;
    }
    if (jsapiWatchdogTimer) {
        clearTimeout(jsapiWatchdogTimer);
        jsapiWatchdogTimer = null;
    }
    drainProbeQueues();

    const watchUrl = `https://www.youtube.com/watch?v=${article.videoId}`;
    setModalWarningBanner(`<div style="display: flex; align-items: center; justify-content: center; gap: 15px; flex-wrap: wrap;">
        <span>⚠️ <strong>Disclaimer:</strong> This video cannot be played embedded directly.</span>
        <a href="${watchUrl}" target="_blank" style="padding: 6px 12px; background: #ef4444; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space: nowrap;">Watch on YouTube</a>
    </div>`);

    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch (e) {}
        ytPlayer = null;
        isMainPlayerReady = false;
    }

    const viewport = document.querySelector('.tmkoc-video-viewport');
    if (viewport) {
        viewport.innerHTML = `
            <div style="width: 100%; height: 100%; background-image: url('${article.image}'); background-size: cover; background-position: center; position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="background: rgba(0,0,0,0.5); position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
                <a href="${watchUrl}" target="_blank" style="z-index: 2; display: flex; flex-direction: column; align-items: center; text-decoration: none; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    <div style="width: 68px; height: 48px; background-color: #ef4444; border-radius: 14px; display: flex; justify-content: center; align-items: center; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.5);">
                        <svg viewBox="0 0 24 24" fill="white" style="width: 32px; height: 32px;"><path d="M8 5v14l11-7z"></path></svg>
                    </div>
                    <span style="color: white; font-weight: bold; font-size: 1.1rem; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">Click to Watch on YouTube</span>
                </a>
            </div>
        `;
    }

    try {
        verifiedVideos.add(article.id);
        updateCardElementStatus(article);
    } catch (e) {}
}

function openCleanPlayer(article) {
    playbackSessionId += 1;
    const activeSessionId = playbackSessionId;

    currentModalArticle = article;
    currentModalEpNum = article.epNumber;
    localStorage.setItem(STORAGE_LAST_OPENED, article.id);

    const initialTimestamps = getTimestamps();
    logActivity('watch', `Episode ${article.epNumber}`, initialTimestamps[article.id] || 0);

    ensureBackgroundAudioKeepAlive();

    let backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (!backdrop) {
        const autoplayState = localStorage.getItem('autoplayNext') !== 'false' ? 'checked' : '';
        backdrop = document.createElement('div');
        backdrop.id = 'tmkoc-clean-backdrop';
        backdrop.className = 'tmkoc-modal-backdrop';
        backdrop.innerHTML = `
            <div class="tmkoc-modal-dialog">
                <div class="tmkoc-modal-header">
                    <div class="tmkoc-modal-title-wrap">
                        <span id="clean-badge" class="tmkoc-modal-badge">EP 1</span>
                        <h3 id="clean-title" class="tmkoc-modal-title">Episode Title</h3>
                    </div>
                    <button class="tmkoc-modal-close" onclick="closeCleanPlayer()" title="Close Player" aria-label="Close Player">✕</button>
                </div>
                <div id="clean-modal-warning" class="tmkoc-geo-warning"></div>
                <div class="tmkoc-video-viewport">
                    <div id="clean-iframe-container"></div>
                </div>
                <div id="clean-description" class="tmkoc-modal-desc" style="padding: 16px 20px; color: var(--text-secondary, #a1a1aa); font-size: 14px; line-height: 1.5; border-bottom: 1px solid var(--border-color, #27272a); max-height: 100px; overflow-y: auto;"></div>
                <div class="tmkoc-modal-footer" style="justify-content: space-between; align-items: center; display: flex;">
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(-1)">◀ Previous Ep</button>
                    <div style="display: flex; align-items: center;">
                        <label style="color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">
                            <input type="checkbox" id="autoplay-toggle" ${autoplayState} onchange="toggleAutoplay(this.checked)" style="accent-color: var(--text-primary); width: 16px; height: 16px; cursor: pointer;">
                            Autoplay Next
                        </label>
                    </div>
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(1)">Next Ep ▶</button>
                </div>
            </div>
        `;
        // Deliberately do not close on backdrop click: prevent accidental dismissal while watching
        document.body.appendChild(backdrop);
    }

    document.getElementById('clean-title').textContent = article.title;
    document.getElementById('clean-badge').textContent = `EP ${article.epNumber}`;

    const descEl = document.getElementById('clean-description');
    if (descEl) {
        descEl.textContent = article.description || '';
        descEl.style.display = article.description ? 'block' : 'none';
    }

    const autoplayToggle = document.getElementById('autoplay-toggle');
    if (autoplayToggle) {
        autoplayToggle.checked = localStorage.getItem('autoplayNext') !== 'false';
    }

    const timestamps = getTimestamps();
    let resumeSeconds = timestamps[article.id] || 0;

    // If opening an upgraded full episode after previously watching only a short clip, start fresh from 0:00!
    const completedShorts = getCompletedShortsList();
    const completedFull = getCompletedWatchedList();
    let epDurSecs = 1260;
    if (article.durationText) {
        const parts = article.durationText.split(':');
        if (parts.length === 3) epDurSecs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        else if (parts.length === 2) epDurSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    if (completedShorts.includes(article.id) && !completedFull.includes(article.id) && epDurSecs >= 900 && resumeSeconds <= 720) {
        resumeSeconds = 0;
    }

    if (article.startTime && resumeSeconds < article.startTime) resumeSeconds = article.startTime;
    if (article.endTime && resumeSeconds > article.endTime) resumeSeconds = article.startTime;

    const candidates = getEpisodeCandidates(article);
    const chosenCandidate = getBestStartCandidate(candidates);

    currentResumeSeconds = resumeSeconds;
    currentCandidates = candidates;
    currentActiveCandidate = chosenCandidate;
    currentPlayingVideoId = chosenCandidate ? chosenCandidate.videoId : '';
    sessionTriedVideoIds = new Set(chosenCandidate ? [chosenCandidate.videoId] : []);
    pendingAttachIframeSessionId = null;
    isMainPlayerLoading = Boolean(chosenCandidate);

    if (mainLoadingTimeout) clearTimeout(mainLoadingTimeout);
    mainLoadingTimeout = setTimeout(() => {
        if (playbackSessionId === activeSessionId) {
            isMainPlayerLoading = false;
        }
    }, 8000);

    if (jsapiWatchdogTimer) {
        clearTimeout(jsapiWatchdogTimer);
        jsapiWatchdogTimer = null;
    }
    if (adjPrecheckTimer) {
        clearTimeout(adjPrecheckTimer);
        adjPrecheckTimer = null;
    }

    // Halt background probe iframes so the active video loads immediately with zero contention
    stopAllProbeWorkers();

    setModalWarningBanner(chosenCandidate ? getWarningBannerForTier(chosenCandidate.tier) : '');

    // Ensure modal is visible BEFORE instructing YouTube player so playback isn't throttled
    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const viewport = document.querySelector('.tmkoc-video-viewport');

    if (window.YT && window.YT.Player) {
        const iframeEl = getCleanIframeElement();
        const hasLiveIframe = Boolean(
            !lastPlayerHadEndTime &&
            !article.endTime &&
            ytPlayer &&
            iframeEl &&
            iframeEl.tagName === 'IFRAME' &&
            (iframeEl.isConnected || (document.body && document.body.contains(iframeEl)))
        );

        if (hasLiveIframe && chosenCandidate) {
            const loadOpts = buildLoadOptions(chosenCandidate, resumeSeconds, article);
            if (isMainPlayerReady && typeof ytPlayer.loadVideoById === 'function') {
                try {
                    ytPlayer.loadVideoById(loadOpts);
                } catch (err) {
                    ytPlayer.loadVideoById(loadOpts.videoId, loadOpts.startSeconds);
                }
                try { ytPlayer.playVideo(); } catch (e) {}
            } else {
                pendingMainPlayerLoad = loadOpts;
            }

            currentActiveEpId = article.id;
            updateMediaSession(article);
            startActiveWatchTracker(article.id);
            return;
        }

        if (ytPlayer) {
            try { ytPlayer.destroy(); } catch (e) {}
            ytPlayer = null;
        }
        isMainPlayerReady = false;
        pendingMainPlayerLoad = null;

        viewport.innerHTML = `<div id="clean-iframe-container" style="position:relative; z-index:1; width:100%; height:100%;"></div>`;

        if (chosenCandidate) {
            const initialOpts = buildLoadOptions(chosenCandidate, resumeSeconds, article);
            lastPlayerHadEndTime = Boolean(initialOpts.endSeconds);
            const pVars = {
                'autoplay': 1,
                'rel': 0,
                'controls': 1,
                'start': initialOpts.startSeconds,
                'modestbranding': 1,
                'iv_load_policy': 3,
                'color': 'white',
                'playsinline': 1
            };
            if (window.location.protocol.startsWith('http')) {
                pVars['origin'] = window.location.origin;
            }
            if (initialOpts.endSeconds) pVars['end'] = initialOpts.endSeconds;

            // Watchdog: ONLY replace if YT.Player failed to render any iframe element; never destroy an in-flight iframe!
            jsapiWatchdogTimer = setTimeout(() => {
                jsapiWatchdogTimer = null;
                if (playbackSessionId !== activeSessionId || !currentModalArticle || isMainPlayerReady) return;
                const existingIframe = viewport ? viewport.querySelector('iframe') : null;
                if (!existingIframe) {
                    renderDirectIframeFallback(viewport, chosenCandidate, resumeSeconds, article, activeSessionId);
                }
            }, 2500);

            ytPlayer = new window.YT.Player('clean-iframe-container', {
                videoId: initialOpts.videoId,
                playerVars: pVars,
                events: createMainPlayerEvents(activeSessionId)
            });
            updateMediaSession(article);
        } else {
            isMainPlayerLoading = false;
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    } else {
        // YT API not ready yet: mount playable iframe immediately and attach JSAPI once API finishes
        renderDirectIframeFallback(viewport, chosenCandidate, resumeSeconds, article, activeSessionId);
    }

    startActiveWatchTracker(article.id);
}

window.openCleanPlayer = openCleanPlayer;

window.closeCleanPlayer = function() {
    playbackSessionId += 1;
    isMainPlayerLoading = false;
    pendingMainPlayerLoad = null;
    pendingAttachIframeSessionId = null;
    if (mainLoadingTimeout) {
        clearTimeout(mainLoadingTimeout);
        mainLoadingTimeout = null;
    }
    if (jsapiWatchdogTimer) {
        clearTimeout(jsapiWatchdogTimer);
        jsapiWatchdogTimer = null;
    }
    if (adjPrecheckTimer) {
        clearTimeout(adjPrecheckTimer);
        adjPrecheckTimer = null;
    }

    const backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (backdrop) backdrop.style.display = 'none';

    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch (e) {}
        ytPlayer = null;
    }
    isMainPlayerReady = false;
    lastPlayerHadEndTime = false;

    const iframe = document.getElementById('clean-iframe');
    if (iframe) iframe.src = '';
    document.body.style.overflow = 'auto';
    stopBackgroundAudioKeepAlive();
    currentModalArticle = null;
    currentModalEpNum = null;
    currentActiveEpId = null;
    currentCandidates = [];
    currentActiveCandidate = null;
    currentPlayingVideoId = '';
    sessionTriedVideoIds = new Set();

    if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
    stopActiveWatchTracker();
    updateFanDashboard();
    initialProbeUnlockTime = Math.max(initialProbeUnlockTime, Date.now() + 2000);
    drainProbeQueues();
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const backdrop = document.getElementById('tmkoc-clean-backdrop');
        if (backdrop && backdrop.style.display !== 'none') {
            window.closeCleanPlayer();
        }
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const backdrop = document.getElementById('tmkoc-clean-backdrop');
        if (backdrop && backdrop.style.display !== 'none' && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
            const state = ytPlayer.getPlayerState();
            if (state === window.YT.PlayerState.PAUSED || state === window.YT.PlayerState.CUED) {
                try { ytPlayer.playVideo(); } catch (e) {}
            }
        }
    }
});

window.toggleAutoplay = function(checked) {
    localStorage.setItem('autoplayNext', checked);
};

window.navCleanEp = function(dir) {
    if (!currentModalEpNum) return;
    let targetEp = parseInt(currentModalEpNum, 10) + dir;
    let iterations = 0;
    while (iterations < 50) {
        const targetArticle = masterEpNumberMap[targetEp] || allArticlesMap[`ep_${targetEp}`] || allArticlesMap[targetEp];
        if (targetArticle) {
            openCleanPlayer(targetArticle);
            return;
        }
        targetEp += dir;
        iterations++;
    }
};

// ----------------------------------------------------
// REAL FAN DASHBOARD & LEADERBOARD ENGINE (ZERO MOCK DATA)
// ----------------------------------------------------
function getFanLevel(watchedCount) {
    if (watchedCount >= 1000) return { title: 'Gokuldham Legend', color: 'var(--text-primary)' };
    if (watchedCount >= 301) return { title: 'Bapuji\'s Favorite', color: 'var(--text-primary)' };
    if (watchedCount >= 51) return { title: 'Soda Shop Regular', color: 'var(--text-primary)' };
    return { title: 'Gokuldham Resident', color: 'var(--text-primary)' };
}

export async function updateFanDashboard() {
    const completedList = getCompletedWatchedList();
    const completedShorts = getCompletedShortsList();
    const watchedCount = completedList.length;
    const shortsCount = completedShorts.length;

    const totalWatchSecs = getExactWatchSeconds();
    const watchHours = Math.floor(totalWatchSecs / 3600);
    const watchMins = Math.floor((totalWatchSecs % 3600) / 60);

    const level = getFanLevel(watchedCount);


    let savedHandle = localStorage.getItem(STORAGE_HANDLE);
    if (!savedHandle) {
        let nextUserNumber = 1;
        try {
            const lbData = await fetchGlobalLeaderboard(1);
            if (lbData && lbData.totalCount !== undefined) {
                nextUserNumber = lbData.totalCount + 1;
            }
        } catch (e) {}
        savedHandle = `Gokuldham resident ${nextUserNumber}`;
        localStorage.setItem(STORAGE_HANDLE, savedHandle);
    }

    const handleInput = document.getElementById('user-handle-input');
    if (handleInput && !handleInput.value) {
        handleInput.value = savedHandle;
    }

    const cardUserBadge = document.getElementById('card-user-badge');
    const cardTierBadge = document.getElementById('card-tier-badge');
    const cardMainStat = document.getElementById('card-main-stat');
    const cardSubStat = document.getElementById('card-sub-stat');

    if (cardUserBadge) cardUserBadge.textContent = savedHandle;
    if (cardTierBadge) cardTierBadge.textContent = level.title;
    if (cardMainStat) {
        cardMainStat.textContent = shortsCount > 0 
            ? `${watchedCount} Full • ${shortsCount} Clips` 
            : `${watchedCount} Episodes Watched`;
    }
    if (cardSubStat) cardSubStat.textContent = `${formatWatchTime(totalWatchSecs / 3600)} Exact Watch Time`;

    // Streak card
    const streakData = getStreakData();
    const currentStreak = streakData.currentStreak || 0;

    // Decimal hours for sidebar + leaderboard
    const decimalHours = totalWatchSecs / 3600;

    // Sidebar: Quick Stats
    const qsEpisodes = document.getElementById('qs-episodes');
    const qsShorts = document.getElementById('qs-shorts');
    const qsUnique = document.getElementById('qs-unique');
    const qsWatchTime = document.getElementById('qs-watch-time');
    const qsStreak = document.getElementById('qs-streak');
    const qsLevel = document.getElementById('qs-level');
    
    const uniqueStartedCount = Object.keys(getTimestamps()).length;
    
    if (qsEpisodes) qsEpisodes.textContent = watchedCount;
    if (qsShorts) qsShorts.textContent = shortsCount;
    if (qsUnique) qsUnique.textContent = uniqueStartedCount;
    if (qsWatchTime) qsWatchTime.textContent = formatWatchTime(decimalHours);
    if (qsStreak) qsStreak.textContent = `${currentStreak} days`;
    if (qsLevel) qsLevel.textContent = level.title;

    // Sidebar: Continue Watching / Brand Card
    const lastEp = getLastWatchedEpisode();
    const brandEpTitle = document.getElementById('brand-ep-title');
    const brandEpSub = document.getElementById('brand-ep-sub');
    const continueBtn = document.getElementById('continue-watching-btn');
    if (lastEp) {
        if (brandEpTitle) brandEpTitle.textContent = `Episode ${lastEp.epNumber}`;
        if (brandEpSub) brandEpSub.textContent = lastEp.title;
        if (continueBtn) {
            continueBtn.style.display = 'flex';
            continueBtn.onclick = () => { if (window.playEpisode) window.playEpisode(lastEp.id); };
        }
    } else {
        if (brandEpTitle) brandEpTitle.textContent = 'No episodes yet';
        if (brandEpSub) brandEpSub.textContent = 'Start watching to track progress';
        if (continueBtn) {
            continueBtn.style.display = 'flex';
            continueBtn.onclick = () => {
                if (window.playEpisode) {
                    window.playEpisode('ep_1');
                }
            };
        }
    }

    // Sidebar: Recent Activity
    const activityEl = document.getElementById('activity-list');
    if (activityEl) {
        const activities = getRecentActivity(5);
        if (activities.length === 0) {
            activityEl.innerHTML = '<div class="activity-empty">No activity yet. Watch an episode to get started!</div>';
        } else {
            activityEl.innerHTML = activities.map(a => {
                const iconClass = '';
                const icon = a.type === 'watch' ? '<span style="font-size: 16px;">▶️</span>' :
                             a.type === 'streak' ? '<span style="font-size: 16px;">🔥</span>' :
                             a.type === 'level' ? '<span style="font-size: 16px;">⭐</span>' : '<span style="font-size: 16px;">▶️</span>';
                let watchText = `Watched ${a.title}`;
                if (a.type === 'watch' && a.duration) {
                    const dur = parseInt(a.duration);
                    if (dur > 0) {
                        const m = Math.floor(dur / 60);
                        const s = dur % 60;
                        if (m > 0) watchText += ` (${m}m ${s}s)`;
                        else watchText += ` (${s}s)`;
                    }
                }
                const label = a.type === 'watch' ? watchText :
                              a.type === 'streak' ? `Streak continued` :
                              a.type === 'level' ? `Reached: ${a.title}` : a.title;
                const sub = a.type === 'streak' ? a.title : getRelativeTime(a.date);
                return `
                    <div class="activity-item">
                        <div class="activity-icon ${iconClass}" style="background: transparent; display: flex; justify-content: center; align-items: center;">${icon}</div>
                        <div class="activity-info">
                            <div class="activity-label">${escapeHTML(label)}</div>
                            <div class="activity-time">${escapeHTML(sub)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Sync current stats to cloud
    await syncCurrentUserStats();

    await renderLeaderboardList(savedHandle, watchedCount, decimalHours, level.title);
}

function createPodiumCardHTML(item) {
    const colorClass = item.rank === '1' ? 'gold' : item.rank === '2' ? 'silver' : 'bronze';
    
    // Fill color logic
    const fillColors = {
        gold: '#fbbf24',
        silver: '#cbd5e1',
        bronze: '#d97706'
    };
    const fillHex = fillColors[colorClass];

    return `
        <div class="lb-podium-card lb-podium-card--${colorClass}${item.isUser ? ' lb-podium-card--you' : ''}">
            <div class="lb-podium__rank lb-podium__rank--${colorClass}" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="${fillHex}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
            </div>
            <div class="lb-podium__handle" style="margin-top: 4px;">
                ${escapeHTML(item.handle)}
                ${item.isUser ? '<span class="lb-you-badge">YOU</span>' : ''}
            </div>
            <div class="lb-podium__level">${escapeHTML(item.level)}</div>
            <div class="lb-podium__stats">${item.count} Eps</div>
            <div class="lb-podium__hours">${formatWatchTime(item.hours)}</div>
        </div>
    `;
}

function createLeaderboardRowHTML(item, isHidden = false) {
    const hiddenStyle = isHidden ? ' style="display:none;"' : '';
    const extraClass = isHidden ? ' lb-row-hidden' : '';
    return `
        <div class="lb-row${item.isUser ? ' lb-row--you' : ''}${extraClass}"${hiddenStyle}>
            <div class="lb-row__left">
                <span class="lb-row__rank">#${item.rank}</span>
                <div class="lb-row__info">
                    <div class="lb-row__handle">
                        ${escapeHTML(item.handle)}
                        ${item.isUser ? '<span class="lb-you-badge">YOU</span>' : ''}
                    </div>
                    <div class="lb-row__level">${escapeHTML(item.level)}</div>
                </div>
            </div>
            <div class="lb-row__right">
                <div class="lb-row__count">${item.count} Eps</div>
                <div class="lb-row__hours">${formatWatchTime(item.hours)}</div>
            </div>
        </div>
    `;
}


async function renderLeaderboardList(userHandle, userCount, userHours, userLevel) {
    const leaderboardEl = document.getElementById('leaderboard-list');
    if (!leaderboardEl) return;

    const isConfigured = isSupabaseConfigured();
    const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const statusBanner = `
        <span style="display:flex; align-items:center; gap:6px;">
            <span class="lb-status__dot ${isConfigured ? 'lb-status__dot--live' : 'lb-status__dot--local'}"></span>
            ${isConfigured ? 'Live Global Sync' : 'Local'}
            <span style="opacity: 0.5; margin-left: 4px; padding-left: 8px; border-left: 1px solid var(--border-color); font-weight: normal;">${nowStr}</span>
        </span>
    `;
    const statusEl = document.getElementById('leaderboard-status');
    if (statusEl) {
        statusEl.innerHTML = statusBanner;
    }

    // Attempt cloud leaderboard fetch if Supabase is configured
    if (isConfigured) {
        leaderboardEl.innerHTML = `<div class="lb-loading">Syncing live global rankings...</div>`;

        const leaderboardData = await fetchGlobalLeaderboard(50);
        if (leaderboardData && leaderboardData.fans && leaderboardData.fans.length > 0) {
            const globalFans = leaderboardData.fans;
            const totalCount = leaderboardData.totalCount;

            if (statusEl) {
                statusEl.innerHTML = `
                    <span style="display:flex; align-items:center; gap:6px;">
                        <span style="opacity: 0.8; margin-right: 4px; padding-right: 8px; border-right: 1px solid var(--border-color); font-weight: 600;">Total Users: ${totalCount}</span>
                        <span class="lb-status__dot lb-status__dot--live"></span>
                        Live Global Sync
                        <span style="opacity: 0.5; margin-left: 4px; padding-left: 8px; border-left: 1px solid var(--border-color); font-weight: normal;">${nowStr}</span>
                    </span>
                `;
            }
            let rowsHtml = '';

            // Split into podium (top 3) and remaining rows
            const podiumFans = globalFans.slice(0, 3);
            const restFans = globalFans.slice(3);
            let userFoundInList = false;

            // Podium
            if (podiumFans.length > 0) {
                rowsHtml += '<div class="lb-podium">';
                podiumFans.forEach(item => {
                    if (item.isUser) userFoundInList = true;
                    rowsHtml += createPodiumCardHTML(item);
                });
                rowsHtml += '</div>';
            }

            if (restFans.length > 0) {
                rowsHtml += '<div class="lb-rows">';
                restFans.forEach((item, index) => {
                    if (item.isUser) userFoundInList = true;
                    // Initially hide ALL rows, we will dynamically reveal them based on sidebar height
                    rowsHtml += createLeaderboardRowHTML(item, true);
                });
                rowsHtml += '</div>';

                rowsHtml += `<button id="lb-load-more" style="width: 100%; margin-top: auto; border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--border-color); cursor: pointer; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Load More (Show Top 50)</button>`;
            }

            // If user has watch progress but didn't make top 50, show user card at bottom
            if (!userFoundInList && (userCount > 0 || userHours > 0)) {
                let userRank = '-';
                try {
                    const fetchedRank = await fetchUserGlobalRank(userCount, userHours);
                    if (fetchedRank) userRank = fetchedRank.toLocaleString();
                } catch(e) {}

                rowsHtml += `
                    <div class="lb-your-standing" style="border-top: 1px solid var(--border-color); margin-top: 16px; padding-top: 16px;">
                        <div class="lb-your-standing__label" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 8px;">Your Global Standing</div>
                        ${createLeaderboardRowHTML({
                            rank: userRank,
                            handle: userHandle || '@TMKOCSuperfan',
                            count: userCount,
                            hours: userHours,
                            level: userLevel,
                            isUser: true
                        })}
                    </div>
                `;
            }

            leaderboardEl.innerHTML = rowsHtml;
            
            const loadMoreBtn = document.getElementById('lb-load-more');
            if (loadMoreBtn) {
                const hiddenRows = Array.from(document.querySelectorAll('.lb-row-hidden'));
                const sidebar = document.querySelector('.dash-sidebar');
                const lbSection = document.querySelector('.leaderboard-section');
                
                if (sidebar && lbSection) {
                    let i = 0;
                    // Show at least 3 rows to guarantee some content under podium
                    while (i < 3 && i < hiddenRows.length) {
                        hiddenRows[i].style.display = 'flex';
                        hiddenRows[i].classList.remove('lb-row-hidden');
                        i++;
                    }
                    
                    // Because CSS stretches the left panel to match the right panel,
                    // we can unhide rows as long as there is empty space inside lbSection.
                    // A row is approx 58px. We check if unhiding one would exceed the sidebar height.
                    const targetHeight = sidebar.offsetHeight;
                    while (i < hiddenRows.length) {
                        hiddenRows[i].style.display = 'flex';
                        // If adding this row made the left section push the grid taller than the sidebar's natural height, revert it
                        if (lbSection.offsetHeight > targetHeight + 5) {
                            hiddenRows[i].style.display = 'none';
                            break;
                        }
                        hiddenRows[i].classList.remove('lb-row-hidden');
                        i++;
                    }
                    
                    if (i >= hiddenRows.length) {
                        loadMoreBtn.style.display = 'none';
                    }
                }

                loadMoreBtn.addEventListener('click', () => {
                    document.querySelectorAll('.lb-row-hidden').forEach(el => {
                        el.style.display = 'flex';
                        el.classList.remove('lb-row-hidden');
                    });
                    loadMoreBtn.style.display = 'none';
                });
            }
            return;
        } else if (leaderboardData && leaderboardData.fans && leaderboardData.fans.length === 0) {
            leaderboardEl.innerHTML = `
                <div class="lb-empty">
                    No fans on the Global Leaderboard yet.<br>Save your handle or watch an episode to claim Rank #1!
                </div>
            `;
            return;
        }
    }

    // Local-only fallback (Zero mock data)
    const realEntries = [];
    if (userCount > 0 || userHours > 0 || userHandle) {
        realEntries.push({
            rank: '1',
            handle: userHandle || '@TMKOCSuperfan',
            count: userCount,
            hours: userHours,
            level: userLevel,
            isUser: true
        });
    }

    if (realEntries.length === 0) {
        leaderboardEl.innerHTML = `
            <div class="lb-empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><br>
                No watched episodes logged yet.<br>Start watching episodes to claim your spot on the Leaderboard!
            </div>
        `;
    } else {
        // Single user — show as podium card
        leaderboardEl.innerHTML = '<div class="lb-podium" style="grid-template-columns: 1fr;">' + realEntries.map(item => createPodiumCardHTML(item)).join('') + '</div>';
    }
}

window.closeFanModal = function() {
    const backdrop = document.getElementById('fan-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
};

window.toggleFullScreen = function() {
    const docEl = document.documentElement;
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

    if (!isFullscreen) {
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (typeof req === 'function') {
            const p = req.call(docEl);
            if (p && typeof p.catch === 'function') {
                p.catch(err => console.warn(`Fullscreen error: ${err.message}`));
            }
        }
    } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (typeof exit === 'function') {
            const p = exit.call(document);
            if (p && typeof p.catch === 'function') {
                p.catch(err => console.warn(`Exit fullscreen error: ${err.message}`));
            }
        }
    }
};

window.saveUserHandle = async function() {
    const input = document.getElementById('user-handle-input');
    const btn = document.getElementById('save-handle-btn');
    if (input && input.value.trim()) {
        const newHandle = input.value.trim();
        localStorage.setItem(STORAGE_HANDLE, newHandle);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
            btn.style.opacity = '0.7';
        }
        await syncCurrentUserStats();
        await updateFanDashboard();
        if (btn) {
            btn.textContent = 'Saved!';
            setTimeout(() => {
                btn.textContent = 'Save';
                btn.disabled = false;
                btn.style.opacity = '1';
            }, 1200);
        }
    }
};

window.copyShareCardText = function() {
    const handle = localStorage.getItem(STORAGE_HANDLE) || '@TMKOCSuperfan';
    const completedList = getCompletedWatchedList();
    const completedShorts = getCompletedShortsList();
    const count = completedList.length;
    const shortsCount = completedShorts.length;
    const totalSecs = getExactWatchSeconds();
    const hours = totalSecs / 3600;
    const level = getFanLevel(count);

    const countText = shortsCount > 0 ? `${count} full episodes + ${shortsCount} clips` : `${count} episodes`;
    const shareText = `I've watched ${countText} (${formatWatchTime(hours)}) of TMKOC on Daily Dose! My Fan Level: ${level.title} (${handle}). Check your level at CodeMasterAbhishek.github.io/Daily-Dose-of-TMOCK/`;

    navigator.clipboard.writeText(shareText).then(() => {
        alert('Copied Social Share Card text to clipboard!');
    });
};

window.allStorylinesMap = {};

window.viewStorylineDetail = function(arcId) {
    const storyline = window.allStorylinesMap[arcId];
    if (!storyline) return;
    
    const event = new CustomEvent('selectStorylineArc', { detail: storyline });
    window.dispatchEvent(event);
};

export function renderStorylinesGrid(storylines, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (!storylines || storylines.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No storylines found.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    storylines.forEach(arc => {
        window.allStorylinesMap[arc.id] = arc;
        const coverEpObj = masterEpNumberMap[arc.coverEp] || masterEpNumberMap[arc.startEp];
        const coverImg = coverEpObj ? coverEpObj.image : `https://img.youtube.com/vi/placeholder/hqdefault.jpg`;

        const card = document.createElement('article');
        card.className = 'card storyline-card';
        card.style.cursor = 'pointer';
        card.onclick = () => window.viewStorylineDetail(arc.id);

        card.innerHTML = `
            <div class="card-img-wrap">
                <img src="${coverImg}" alt="${escapeHTML(arc.title)}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Storyline'">
                <span class="card-duration-badge" style="background: rgba(15,23,42,0.85); font-weight: 800;">${arc.totalEpisodes} EPISODES</span>
            </div>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase;">EP ${arc.startEp} TO EP ${arc.endEp}</span>
                </div>
                <h2 class="card-title" style="margin-top: 4px;">
                    <a href="javascript:void(0)" onclick="window.viewStorylineDetail('${arc.id}')">${escapeHTML(arc.title)}</a>
                </h2>
                <p style="font-size: 12px; opacity: 0.75; margin-top: 6px; line-height: 1.4; color: var(--text-primary);">${escapeHTML(arc.description)}</p>
            </div>
        `;

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

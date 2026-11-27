/**
 * UI module for DailyDose TMKOC, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */
import {
    syncUserToCloud,
    fetchGlobalLeaderboard,
    fetchUserGlobalRank,
    isSupabaseConfigured,
    getOrCreateUserId,
    getOrCreateUserToken,
    reportDeadLinkToCloud,
    fetchKnownDeadLinks,
    isHandleTaken,
    fetchEpisodeReactions,
    setEpisodeReaction,
    getCachedEpisodeReactionSummary,
    setCachedEpisodeReactionSummary,
    fetchEpisodeComments,
    postEpisodeComment,
    toggleCommentLike,
    deleteEpisodeComment,
    saveUserAvatarToCloud
} from './supabase.js?v=45';
import {
    getSelectedAvatarId,
    setSelectedAvatarId,
    getAvatarInfo,
    normalizeAvatarId,
    renderAvatarBadgeHTML,
    renderAvatarPickerHTML
} from './avatars.js?v=45';
import {
    generateFanCardCanvas,
    downloadFanCardPNG
} from './fan-card.js?v=45';

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
let masterArticlesList = [];
let masterStorylinesList = [];
let currentModalEpNum = null;
let savedFeedScrollY = 0;
let pendingManualSeek = { sec: 0, until: 0 };
const DEFAULT_PAGE_TITLE = document.title || 'Daily Dose of TMKOC | Taarak Mehta Ka Ooltah Chashmah';

// LocalStorage Keys
const STORAGE_COMPLETED = 'tmkoc_completed_watched_eps'; // Only >= 90% completed full episodes
const STORAGE_COMPLETED_SHORTS = 'tmkoc_completed_shorts'; // Only >= 90% completed short clips
const STORAGE_TIMESTAMPS = 'tmkoc_timestamps';
const STORAGE_EXACT_WATCH_SECONDS = 'tmkoc_exact_watch_seconds';
const STORAGE_HANDLE = 'tmkoc_user_handle';
const STORAGE_CUSTOM_NAME_SET = 'tmkoc_custom_name_set';
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

// --- Gentle Probe Pool & Geo-block Cache ---
const PROBE_POOL_SIZE = 2;
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
let mutedForWarmReuse = false;
let lastPlayerHadEndTime = false;
let pendingMainPlayerLoad = null;
let pendingAttachIframeSessionId = null;
let mainLoadingTimeout = null;
let jsapiWatchdogTimer = null;
let adjPrecheckTimer = null;
let probeDrainTimer = null;
let initialProbeUnlockTime = Date.now() + 1500;
let playbackSessionId = 0;
let ytPlayerInstanceToken = 0;
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
    const delay = highPriorityQueue.length > 0 ? 20 : 120;
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
                host: 'https://www.youtube-nocookie.com',
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
                            worker.timer = setTimeout(() => finishWorkerJob(worker, activeToken, false, false), 1100);
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
    }, 1200);

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

function scheduleAdjacentPrecheck(article, expectedSessionId) {
    if (adjPrecheckTimer) {
        clearTimeout(adjPrecheckTimer);
        adjPrecheckTimer = null;
    }
    if (!article) return;
    const base = parseInt(article.epNumber, 10);
    adjPrecheckTimer = setTimeout(() => {
        adjPrecheckTimer = null;
        if (playbackSessionId !== expectedSessionId || !currentModalArticle || isMainPlayerLoading) return;
        // Pre-verify any alternate backups/shorts of the current episode once playback is running
        const candidates = getEpisodeCandidates(article);
        if (candidates.length > 1) {
            resolveArticleLinks(article, 'high', currentPlayingVideoId).catch(() => {});
        }
        if (!isNaN(base)) {
            [base + 1, base - 1].forEach(num => {
                const adjArt = masterEpNumberMap[num] || allArticlesMap[`ep_${num}`] || allArticlesMap[num];
                if (adjArt && !verifiedVideos.has(adjArt.id)) {
                    verifiedVideos.add(adjArt.id);
                    resolveArticleLinks(adjArt, 'high', null).catch(() => {});
                }
            });
        }
    }, 150);
}

function handleYouTubeApiAvailable() {
    if (!(window.YT && window.YT.Player)) return;
    if (pendingAttachIframeSessionId && pendingAttachIframeSessionId === playbackSessionId && currentModalArticle && !ytPlayer) {
        const directIframe = document.getElementById('clean-iframe');
        if (directIframe) {
            pendingAttachIframeSessionId = null;
            const playerToken = ++ytPlayerInstanceToken;
            try {
                ytPlayer = new window.YT.Player('clean-iframe', {
                    host: 'https://www.youtube-nocookie.com',
                    events: createMainPlayerEvents(playerToken)
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

window.playEpisode = function(id, options = {}) {
    const article = allArticlesMap[id] || masterEpNumberMap[id];
    if (article) {
        openCleanPlayer(article, options);
    }
};

export function playEpisodeByParam(epParam, startSeconds = 0) {
    if (!epParam) return false;
    const clean = String(epParam).trim();
    const numMatch = clean.match(/^(?:ep_)?(\d+)$/i);
    const numericEp = numMatch ? parseInt(numMatch[1], 10) : parseInt(clean, 10);
    const article = (numericEp && masterEpNumberMap[numericEp]) || allArticlesMap[clean] || (numericEp && allArticlesMap[`ep_${numericEp}`]);
    if (!article) return false;
    const cleanSecs = Math.max(0, Math.floor(Number(startSeconds) || 0));
    openCleanPlayer(article, cleanSecs > 0 ? { startSecondsOverride: cleanSecs } : {});
    return true;
}

export function registerMasterArticles(articles) {
    masterArticlesList = Array.isArray(articles) ? articles : [];
    articles.forEach(art => {
        allArticlesMap[art.id] = art;
        masterEpNumberMap[art.epNumber] = art;
    });
}

export function registerMasterStorylines(storylines) {
    masterStorylinesList = Array.isArray(storylines) ? storylines : [];
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
            initialProbeUnlockTime = Math.max(initialProbeUnlockTime, Date.now() + 1500);
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
            }, 220);
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
                const liveSecs = Math.floor(ytPlayer.getCurrentTime());
                const waitingForSeek = Date.now() < pendingManualSeek.until && Math.abs(liveSecs - pendingManualSeek.sec) > 5;
                if (!waitingForSeek) {
                    currentEpSecs = liveSecs;
                    pendingManualSeek.until = 0;
                } else {
                    currentEpSecs = pendingManualSeek.sec;
                }
            } else {
                currentEpSecs += 1;
            }
            
            pendingExactWatchSeconds = totalSecs;
            
            currentResumeSeconds = currentEpSecs;
            timestamps[articleId] = currentEpSecs;
            pendingTimestamps = timestamps;
            updateShareTimestampLabel();
            updateCommentInsertTimestampLabel();

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

function destroyMainPlayer() {
    ytPlayerInstanceToken += 1;
    mutedForWarmReuse = false;
    pendingMainPlayerLoad = null;
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch (e) {}
        ytPlayer = null;
    }
    isMainPlayerReady = false;
    lastPlayerHadEndTime = false;
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

function createMainPlayerEvents(playerToken) {
    return {
        'onReady': function() {
            if (ytPlayerInstanceToken !== playerToken) return;
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
                if (mutedForWarmReuse) {
                    mutedForWarmReuse = false;
                    try { ytPlayer.unMute(); } catch (e) {}
                }
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
                    scheduleAdjacentPrecheck(currentModalArticle, playbackSessionId);
                }
            } catch (e) {}
            updateMediaSession(currentModalArticle);
        },
        'onError': function(event) {
            if (ytPlayerInstanceToken !== playerToken) return;
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
            if (ytPlayerInstanceToken !== playerToken) return;
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
                scheduleAdjacentPrecheck(currentArt, playbackSessionId);
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
    destroyMainPlayer();

    if (chosenCandidate) {
        const opts = buildLoadOptions(chosenCandidate, resumeSeconds, article);
        const sParam = opts.startSeconds > 0 ? `&start=${opts.startSeconds}` : '';
        const eParam = opts.endSeconds ? `&end=${opts.endSeconds}` : '';
        const originParam = window.location.protocol.startsWith('http')
            ? `&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
            : '';
        pendingAttachIframeSessionId = originParam ? activeSessionId : null;
        viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube-nocookie.com/embed/${opts.videoId}?autoplay=1&rel=0&controls=1&modestbranding=1&iv_load_policy=3&color=white&playsinline=1${originParam}${sParam}${eParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        if (window.YT && window.YT.Player && pendingAttachIframeSessionId === activeSessionId) {
            handleYouTubeApiAvailable();
        }
    } else {
        pendingAttachIframeSessionId = null;
        viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube-nocookie.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
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

    destroyMainPlayer();

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

const reactionRequestSeq = {};

function formatTimestampShort(totalSeconds) {
    const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCompactCount(num) {
    const n = Math.max(0, Math.floor(Number(num) || 0));
    if (n < 1000) return String(n);
    if (n < 1000000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K`;
    return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

function getCurrentPlayerSeconds() {
    if (Date.now() < pendingManualSeek.until) {
        return Math.max(0, Math.floor(pendingManualSeek.sec || 0));
    }
    try {
        if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && !isMainPlayerLoading) {
            const vd = typeof ytPlayer.getVideoData === 'function' ? ytPlayer.getVideoData() : null;
            const matchesCurrentVideo = !vd || !vd.video_id || !currentPlayingVideoId || vd.video_id === currentPlayingVideoId;
            if (matchesCurrentVideo) {
                const t = Math.floor(ytPlayer.getCurrentTime());
                if (t > 0) return t;
            }
        }
    } catch (e) {}
    return Math.max(0, Math.floor(currentResumeSeconds || 0));
}

function updateShareTimestampLabel() {
    const labelEl = document.getElementById('share-timestamp-label');
    if (labelEl) {
        labelEl.textContent = `Start at ${formatTimestampShort(getCurrentPlayerSeconds())}`;
    }
    updateSharePopoverUrl();
}

function renderReactionBar(summary) {
    const likeBtn = document.getElementById('ep-like-btn');
    const dislikeBtn = document.getElementById('ep-dislike-btn');
    const likeCountEl = document.getElementById('ep-like-count');
    const dislikeCountEl = document.getElementById('ep-dislike-count');
    if (!likeBtn || !dislikeBtn || !likeCountEl || !dislikeCountEl) return;

    const likes = Math.max(0, Number(summary?.likes) || 0);
    const dislikes = Math.max(0, Number(summary?.dislikes) || 0);
    const userReaction = Number(summary?.userReaction) || 0;

    likeCountEl.textContent = formatCompactCount(likes);
    dislikeCountEl.textContent = formatCompactCount(dislikes);

    likeBtn.classList.toggle('is-active', userReaction === 1);
    likeBtn.setAttribute('aria-pressed', userReaction === 1 ? 'true' : 'false');
    likeBtn.title = `${likes} ${likes === 1 ? 'like' : 'likes'}`;

    dislikeBtn.classList.toggle('is-active', userReaction === -1);
    dislikeBtn.setAttribute('aria-pressed', userReaction === -1 ? 'true' : 'false');
    dislikeBtn.title = `${dislikes} ${dislikes === 1 ? 'dislike' : 'dislikes'}`;
}

async function loadEpisodeReactions(episodeId) {
    if (!episodeId) return;
    renderReactionBar(getCachedEpisodeReactionSummary(episodeId));
    const seq = (reactionRequestSeq[episodeId] || 0) + 1;
    reactionRequestSeq[episodeId] = seq;

    const summary = await fetchEpisodeReactions(episodeId);
    if (reactionRequestSeq[episodeId] === seq && currentModalArticle && currentModalArticle.id === episodeId) {
        renderReactionBar(summary);
    }
}

function pulseActionButton(btn) {
    if (!btn) return;
    btn.classList.remove('is-popping');
    void btn.offsetWidth;
    btn.classList.add('is-popping');
    setTimeout(() => btn.classList.remove('is-popping'), 280);
}

async function handleEpisodeReactionClick(vote) {
    if (!currentModalArticle) return;
    const epId = currentModalArticle.id;
    const current = getCachedEpisodeReactionSummary(epId);
    const nextVote = current.userReaction === vote ? 0 : vote;

    let nextLikes = current.likes;
    let nextDislikes = current.dislikes;
    if (current.userReaction === 1) nextLikes = Math.max(0, nextLikes - 1);
    if (current.userReaction === -1) nextDislikes = Math.max(0, nextDislikes - 1);
    if (nextVote === 1) nextLikes += 1;
    if (nextVote === -1) nextDislikes += 1;

    const optimistic = {
        likes: nextLikes,
        dislikes: nextDislikes,
        userReaction: nextVote,
        synced: current.synced
    };
    setCachedEpisodeReactionSummary(epId, optimistic);
    renderReactionBar(optimistic);
    pulseActionButton(document.getElementById(vote === 1 ? 'ep-like-btn' : 'ep-dislike-btn'));

    const seq = (reactionRequestSeq[epId] || 0) + 1;
    reactionRequestSeq[epId] = seq;

    const result = await setEpisodeReaction(epId, nextVote);
    if (reactionRequestSeq[epId] === seq && currentModalArticle && currentModalArticle.id === epId) {
        renderReactionBar(result);
    }
}

function buildEpisodeShareUrl(article, includeTimestamp) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('ep', String(article.epNumber));
    if (includeTimestamp) {
        const secs = getCurrentPlayerSeconds();
        if (secs > 0) {
            url.searchParams.set('t', String(secs));
        }
    }
    return url.toString();
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {}
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}

let shareCopiedTimeout = null;

function updateSharePopoverUrl() {
    if (!currentModalArticle) return;
    const previewInput = document.getElementById('share-url-preview-input');
    if (!previewInput) return;
    const includeTs = Boolean(document.getElementById('share-at-timestamp')?.checked);
    previewInput.value = buildEpisodeShareUrl(currentModalArticle, includeTs);
}

function updateShareScrollButtonState() {
    const track = document.getElementById('share-targets-track');
    const prevBtn = document.getElementById('share-targets-prev');
    const nextBtn = document.getElementById('share-targets-next');
    if (!track) return;
    const hasOverflow = track.scrollWidth > track.clientWidth + 4;
    track.classList.toggle('is-scrollable', hasOverflow);
    const atStart = track.scrollLeft <= 4;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (prevBtn) prevBtn.style.display = hasOverflow && !atStart ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasOverflow && !atEnd ? 'inline-flex' : 'none';
}

function closeSharePopover() {
    const backdrop = document.getElementById('ep-share-backdrop');
    const shareBtn = document.getElementById('ep-share-btn');
    if (backdrop) {
        backdrop.style.display = 'none';
        backdrop.setAttribute('aria-hidden', 'true');
    }
    if (shareBtn) shareBtn.setAttribute('aria-expanded', 'false');
}

function openSharePopover() {
    const backdrop = document.getElementById('ep-share-backdrop');
    const shareBtn = document.getElementById('ep-share-btn');
    const track = document.getElementById('share-targets-track');
    if (!backdrop) return;
    updateShareTimestampLabel();
    updateSharePopoverUrl();
    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
    if (shareBtn) shareBtn.setAttribute('aria-expanded', 'true');
    if (track) track.scrollLeft = 0;
    requestAnimationFrame(updateShareScrollButtonState);
}

function handleEpisodeShareClick() {
    if (!currentModalArticle) return;
    const backdrop = document.getElementById('ep-share-backdrop');
    if (backdrop && backdrop.style.display !== 'none') {
        closeSharePopover();
    } else {
        openSharePopover();
    }
}

async function handleShareCopyButtonClick() {
    if (!currentModalArticle) return;
    const includeTs = Boolean(document.getElementById('share-at-timestamp')?.checked);
    const secs = includeTs ? getCurrentPlayerSeconds() : 0;
    const shareUrl = buildEpisodeShareUrl(currentModalArticle, includeTs);
    const epNum = currentModalArticle.epNumber;

    const copied = await copyTextToClipboard(shareUrl);
    if (copied) {
        const copyBtn = document.getElementById('share-copy-btn');
        if (copyBtn) {
            copyBtn.classList.add('is-copied');
            copyBtn.textContent = 'Copied!';
            if (shareCopiedTimeout) clearTimeout(shareCopiedTimeout);
            shareCopiedTimeout = setTimeout(() => {
                copyBtn.classList.remove('is-copied');
                copyBtn.textContent = 'Copy';
            }, 1800);
        }
        const msg = secs > 0
            ? `Copied link for Episode ${epNum} (at ${formatTimestampShort(secs)})!`
            : `Copied link for Episode ${epNum}!`;
        showCustomToast(msg, 'success');
    } else {
        showCustomToast('Could not copy link automatically. Copy from link box.', 'error');
    }
}

function buildSocialShareDestination(platform, shareUrl, article) {
    const epNum = article.epNumber;
    const title = `EP ${epNum}: ${article.title}`;
    const text = `Watch TMKOC Episode ${epNum}: ${article.title}`;
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text);
    const routes = {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`,
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
        reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(title)}`,
        email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${shareUrl}`)}`
    };
    return routes[platform] || '';
}

function handleSocialShareClick(platform) {
    if (!currentModalArticle || !platform) return;
    const includeTs = Boolean(document.getElementById('share-at-timestamp')?.checked);
    const shareUrl = buildEpisodeShareUrl(currentModalArticle, includeTs);
    const targetUrl = buildSocialShareDestination(platform, shareUrl, currentModalArticle);
    if (!targetUrl) return;
    if (platform === 'email') {
        window.location.href = targetUrl;
    } else {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
    closeSharePopover();
}

function syncUrlWithEpisode(epNumberOrNull, usePushState = false) {
    if (!window.location.protocol.startsWith('http') || !window.history || typeof window.history.replaceState !== 'function') {
        return;
    }
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('t');
        if (epNumberOrNull) {
            url.searchParams.set('ep', String(epNumberOrNull));
        } else {
            url.searchParams.delete('ep');
        }
        const nextUrl = url.pathname + url.search + url.hash;
        if (epNumberOrNull && usePushState && typeof window.history.pushState === 'function') {
            window.history.pushState({ view: 'watch', ep: epNumberOrNull }, '', nextUrl);
        } else {
            window.history.replaceState({ view: epNumberOrNull ? 'watch' : 'feed' }, '', nextUrl);
        }
    } catch (e) {}
}

// ----------------------------------------------------
// PHASE 2 & 3: IN-HOUSE COMMENTS, TIMESTAMPS & AVATARS
// ----------------------------------------------------
let commentRequestSeq = 0;
let commentsState = {
    episodeId: null,
    sort: 'top',
    totalCount: 0,
    comments: [],
    loading: false
};
let commentCooldownUntil = 0;
let commentCooldownInterval = null;
let pendingDeleteCommentId = null;
let pendingDeleteTimer = null;

function getCurrentCommentHandle() {
    const saved = (localStorage.getItem(STORAGE_HANDLE) || '').trim();
    return saved || 'Gokuldham Resident';
}

function updateComposerIdentity() {
    const handle = getCurrentCommentHandle();
    const avatarId = getSelectedAvatarId();
    const handleEl = document.getElementById('comment-composer-handle');
    const avatarBtn = document.getElementById('comment-composer-avatar-btn');
    if (handleEl) handleEl.textContent = handle;
    if (avatarBtn) {
        avatarBtn.innerHTML = renderAvatarBadgeHTML(avatarId, handle, 'sm', 'tmkoc-comment-avatar--self', 'comment-composer-avatar');
    }
    const tray = document.getElementById('comment-avatar-tray');
    if (tray && tray.style.display !== 'none') {
        tray.innerHTML = renderAvatarPickerHTML(avatarId, true);
    }
}

function refreshAvatarPickersUI() {
    const activeId = getSelectedAvatarId();
    const info = getAvatarInfo(activeId);
    const labelName = info ? info.name : 'Initial';

    const sidebarGrid = document.getElementById('sidebar-avatar-grid');
    const sidebarLabel = document.getElementById('selected-avatar-name');
    if (sidebarGrid) {
        sidebarGrid.innerHTML = renderAvatarPickerHTML(activeId, false);
    }
    if (sidebarLabel) sidebarLabel.textContent = labelName;

    const heroAvatarSlot = document.getElementById('profile-hero-avatar');
    if (heroAvatarSlot) {
        heroAvatarSlot.innerHTML = renderAvatarBadgeHTML(activeId, getCurrentCommentHandle(), 'lg', 'profile-hero__avatar');
    }

    updateComposerIdentity();

    if (commentsState.comments.length > 0) {
        let changed = false;
        commentsState.comments.forEach(c => {
            if (c.is_own) {
                c.avatar_id = activeId;
                changed = true;
            }
        });
        if (changed) renderCommentsUI();
    }
}

async function selectAndPersistAvatar(avatarId) {
    const clean = setSelectedAvatarId(avatarId);
    refreshAvatarPickersUI();

    const tray = document.getElementById('comment-avatar-tray');
    if (tray) tray.style.display = 'none';

    const info = getAvatarInfo(clean);
    showCustomToast(
        info ? `Character avatar set to ${info.name}!` : 'Avatar reset to initial badge.',
        'success'
    );

    await saveUserAvatarToCloud(clean);

    // Refresh leaderboard view cleanly if currently mounted
    const lbContainer = document.getElementById('leaderboard-list');
    if (lbContainer && document.getElementById('fan-dashboard-view')?.style.display !== 'none') {
        const savedHandle = getCurrentCommentHandle();
        const completedCount = getCompletedWatchedList().length;
        const decimalHours = getExactWatchSeconds() / 3600;
        const level = getFanLevel(completedCount);
        renderLeaderboardList(savedHandle, completedCount, decimalHours, level.title);
    }
}

function bindSidebarAvatarPicker() {
    const grid = document.getElementById('sidebar-avatar-grid');
    if (!grid) return;
    const activeId = getSelectedAvatarId();
    const info = getAvatarInfo(activeId);
    const label = document.getElementById('selected-avatar-name');
    grid.innerHTML = renderAvatarPickerHTML(activeId, false);
    if (label) label.textContent = info ? info.name : 'Initial';

    if (!grid.dataset.avatarBound) {
        grid.dataset.avatarBound = 'true';
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-picker-option');
            if (!btn || !btn.dataset.avatarChoice) return;
            selectAndPersistAvatar(btn.dataset.avatarChoice);
        });
    }
}

function updateCommentInsertTimestampLabel() {
    const labelEl = document.getElementById('comment-insert-ts-label');
    if (!labelEl) return;
    labelEl.textContent = formatTimestampShort(getCurrentPlayerSeconds());
}

function formatRelativeTime(isoDate) {
    if (!isoDate) return 'just now';
    const ts = new Date(isoDate).getTime();
    if (Number.isNaN(ts)) return 'just now';
    const diffSecs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSecs < 60) return 'just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCommentContentHTML(rawText) {
    const str = String(rawText || '');
    const tsRegex = /\b(?:([0-2]):)?([0-5]?\d):([0-5]\d)\b/g;
    let out = '';
    let lastIndex = 0;
    let match;
    while ((match = tsRegex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            out += escapeHTML(str.slice(lastIndex, match.index));
        }
        const hrs = match[1] ? parseInt(match[1], 10) : 0;
        const mins = parseInt(match[2], 10);
        const secs = parseInt(match[3], 10);
        const totalSecs = hrs * 3600 + mins * 60 + secs;
        const label = escapeHTML(match[0]);
        out += `<button type="button" class="tmkoc-comment-ts" data-seek-sec="${totalSecs}" title="Jump video to ${label}">${label}</button>`;
        lastIndex = tsRegex.lastIndex;
    }
    if (lastIndex < str.length) {
        out += escapeHTML(str.slice(lastIndex));
    }
    return out.replace(/\n/g, '<br>');
}

function seekPlayerToSeconds(targetSeconds) {
    let seekSec = Math.max(0, Math.floor(Number(targetSeconds) || 0));
    if (currentModalArticle) {
        if (currentModalArticle.startTime && currentModalArticle.endTime) {
            if (seekSec < currentModalArticle.startTime) {
                seekSec = currentModalArticle.startTime + seekSec;
            }
            if (seekSec > currentModalArticle.endTime) {
                seekSec = currentModalArticle.startTime;
            }
        }
    }

    pendingManualSeek = { sec: seekSec, until: Date.now() + 2500 };
    currentResumeSeconds = seekSec;
    updateShareTimestampLabel();
    updateCommentInsertTimestampLabel();

    if (window.scrollY > 120) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
        if (mutedForWarmReuse) {
            mutedForWarmReuse = false;
            try { ytPlayer.unMute(); } catch (e) {}
        }
        try { ytPlayer.seekTo(seekSec, true); } catch (e) {}
        try {
            if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
        } catch (e) {}
    } else if (pendingMainPlayerLoad) {
        pendingMainPlayerLoad.startSeconds = seekSec;
    } else {
        const directIframe = document.getElementById('clean-iframe');
        if (directIframe && directIframe.src && directIframe.src.includes('/embed/')) {
            try {
                const iframeUrl = new URL(directIframe.src);
                iframeUrl.searchParams.set('start', String(seekSec));
                iframeUrl.searchParams.set('autoplay', '1');
                directIframe.src = iframeUrl.toString();
            } catch (e) {}
        }
    }
}

function showCommentError(msg) {
    const errEl = document.getElementById('ep-comment-error');
    const inputEl = document.getElementById('ep-comment-input');
    if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
    }
    if (inputEl) {
        inputEl.classList.remove('input-shake');
        void inputEl.offsetWidth;
        inputEl.classList.add('input-shake');
        setTimeout(() => inputEl.classList.remove('input-shake'), 420);
    }
}

function clearCommentError() {
    const errEl = document.getElementById('ep-comment-error');
    if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
    }
}

function updateCommentSubmitButtonState() {
    const submitBtn = document.getElementById('ep-comment-submit');
    if (!submitBtn) return;
    const remSecs = Math.ceil((commentCooldownUntil - Date.now()) / 1000);
    if (remSecs > 0) {
        submitBtn.disabled = true;
        submitBtn.textContent = `Wait ${remSecs}s`;
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Comment';
        if (commentCooldownInterval) {
            clearInterval(commentCooldownInterval);
            commentCooldownInterval = null;
        }
    }
}

function startCommentCooldown(seconds) {
    const cleanSecs = Math.max(1, Math.min(60, Math.ceil(Number(seconds) || 30)));
    commentCooldownUntil = Date.now() + cleanSecs * 1000;
    if (commentCooldownInterval) {
        clearInterval(commentCooldownInterval);
        commentCooldownInterval = null;
    }
    updateCommentSubmitButtonState();
    commentCooldownInterval = setInterval(updateCommentSubmitButtonState, 1000);
}

function insertCurrentTimestampIntoComment() {
    const textarea = document.getElementById('ep-comment-input');
    const charCountEl = document.getElementById('ep-comment-char-count');
    if (!textarea) return;

    clearCommentError();
    const tsText = formatTimestampShort(getCurrentPlayerSeconds());
    const val = textarea.value || '';
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : val.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : val.length;

    const before = val.slice(0, start);
    const after = val.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const insertToken = `${needsLeadingSpace ? ' ' : ''}${tsText} `;
    const nextVal = (before + insertToken + after).slice(0, 500);

    textarea.value = nextVal;
    const newCursorPos = Math.min(nextVal.length, before.length + insertToken.length);
    textarea.focus();
    try { textarea.setSelectionRange(newCursorPos, newCursorPos); } catch (e) {}

    if (charCountEl) {
        charCountEl.textContent = `${nextVal.length} / 500`;
    }
}

function renderCommentsUI() {
    const countEl = document.getElementById('ep-comments-count');
    const listEl = document.getElementById('ep-comments-list');
    const moreWrap = document.getElementById('ep-comments-more-wrap');
    const topBtn = document.getElementById('comments-sort-top');
    const newestBtn = document.getElementById('comments-sort-newest');

    if (topBtn) topBtn.classList.toggle('is-active', commentsState.sort === 'top');
    if (newestBtn) newestBtn.classList.toggle('is-active', commentsState.sort === 'newest');
    if (countEl) countEl.textContent = formatCompactCount(commentsState.totalCount);
    if (!listEl) return;

    if (commentsState.loading && commentsState.comments.length === 0) {
        listEl.innerHTML = `
            <div class="tmkoc-comment-skeleton">
                <div class="skeleton" style="width:34px;height:34px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;"><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text"></div></div>
            </div>
            <div class="tmkoc-comment-skeleton">
                <div class="skeleton" style="width:34px;height:34px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;"><div class="skeleton skeleton-text short"></div><div class="skeleton skeleton-text"></div></div>
            </div>
        `;
        if (moreWrap) moreWrap.style.display = 'none';
        return;
    }

    if (commentsState.comments.length === 0) {
        const epLabel = currentModalArticle ? `Episode ${currentModalArticle.epNumber}` : 'this episode';
        listEl.innerHTML = `
            <div class="tmkoc-comments-empty">
                No comments yet for ${escapeHTML(epLabel)}. Be the first Gokuldham fan to share a thought or funny timestamp!
            </div>
        `;
        if (moreWrap) moreWrap.style.display = 'none';
        return;
    }

    listEl.innerHTML = commentsState.comments.map(c => {
        const author = c.user_handle || 'Gokuldham Resident';
        const effectiveAvatar = c.is_own ? getSelectedAvatarId() : normalizeAvatarId(c.avatar_id || 'default');
        const avatarHtml = renderAvatarBadgeHTML(effectiveAvatar, author, 'md', 'tmkoc-comment-avatar');
        const relTime = formatRelativeTime(c.created_at);
        const likeCount = Math.max(0, Number(c.likes_count) || 0);
        const isConfirmingDelete = pendingDeleteCommentId === String(c.id);
        const cid = escapeHTML(String(c.id));

        return `
            <article class="tmkoc-comment-item" data-comment-id="${cid}">
                ${avatarHtml}
                <div class="tmkoc-comment-body">
                    <div class="tmkoc-comment-meta">
                        <span class="tmkoc-comment-author">${escapeHTML(author)}</span>
                        ${c.is_own ? '<span class="tmkoc-comment-you">YOU</span>' : ''}
                        <span class="tmkoc-comment-time">${escapeHTML(relTime)}</span>
                    </div>
                    <p class="tmkoc-comment-text">${formatCommentContentHTML(c.content)}</p>
                    <div class="tmkoc-comment-item-actions">
                        <button type="button" class="tmkoc-comment-like-btn ${c.user_liked ? 'is-active' : ''}" data-comment-id="${cid}" aria-pressed="${c.user_liked ? 'true' : 'false'}" title="Upvote comment">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                            <span class="tmkoc-comment-like-num">${formatCompactCount(likeCount)}</span>
                        </button>
                        ${c.is_own ? `
                            <button type="button" class="tmkoc-comment-delete-btn ${isConfirmingDelete ? 'is-confirming' : ''}" data-comment-id="${cid}" title="Delete your comment">
                                ${isConfirmingDelete ? 'Confirm delete?' : 'Delete'}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    if (moreWrap) {
        const hasMore = commentsState.comments.length < commentsState.totalCount;
        moreWrap.style.display = hasMore ? 'flex' : 'none';
    }
}

async function loadEpisodeComments(episodeId, reset = true) {
    if (!episodeId) return;
    commentRequestSeq += 1;
    const reqId = commentRequestSeq;

    if (reset) {
        pendingDeleteCommentId = null;
        if (pendingDeleteTimer) {
            clearTimeout(pendingDeleteTimer);
            pendingDeleteTimer = null;
        }
        commentsState = {
            episodeId,
            sort: commentsState.sort || 'top',
            totalCount: 0,
            comments: [],
            loading: true
        };
        renderCommentsUI();
    } else {
        commentsState.loading = true;
    }

    const offset = reset ? 0 : commentsState.comments.length;
    const res = await fetchEpisodeComments(episodeId, {
        sort: commentsState.sort,
        limit: 20,
        offset
    });

    if (reqId !== commentRequestSeq || !currentModalArticle || currentModalArticle.id !== episodeId) {
        return;
    }

    commentsState.loading = false;
    if (res && res.success) {
        commentsState.totalCount = res.total_count;
        if (reset) {
            commentsState.comments = res.comments;
        } else {
            const seen = new Set(commentsState.comments.map(c => c.id));
            const appended = res.comments.filter(c => !seen.has(c.id));
            commentsState.comments = [...commentsState.comments, ...appended];
        }
    }
    renderCommentsUI();
}

async function handleCommentFormSubmit() {
    if (!currentModalArticle) return;
    const epId = currentModalArticle.id;
    const inputEl = document.getElementById('ep-comment-input');
    const submitBtn = document.getElementById('ep-comment-submit');
    const charCountEl = document.getElementById('ep-comment-char-count');
    if (!inputEl || !submitBtn) return;

    const remSecs = Math.ceil((commentCooldownUntil - Date.now()) / 1000);
    if (remSecs > 0) {
        showCommentError(`Please wait ${remSecs}s before posting another comment.`);
        updateCommentSubmitButtonState();
        return;
    }

    const rawText = inputEl.value.trim();
    if (rawText.length < 2) {
        showCommentError('Please write at least 2 characters before posting.');
        return;
    }

    clearCommentError();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    const handle = getCurrentCommentHandle();
    const res = await postEpisodeComment(epId, handle, rawText);

    if (!currentModalArticle || currentModalArticle.id !== epId) return;

    if (!res || !res.success) {
        if (res && res.code === 'rate_limited' && res.retry_after) {
            startCommentCooldown(res.retry_after);
        } else {
            updateCommentSubmitButtonState();
        }
        showCommentError((res && res.error) || 'Could not post comment. Please try again.');
        return;
    }

    collapseCommentComposer(true);
    if (res.comment) {
        commentsState.comments = [res.comment, ...commentsState.comments];
        commentsState.totalCount += 1;
    }
    renderCommentsUI();
    startCommentCooldown(30);
    showCustomToast('Comment posted!', 'success');
}

async function handleCommentLikeClick(commentId) {
    if (!commentId) return;
    const target = commentsState.comments.find(c => String(c.id) === String(commentId));
    if (!target) return;

    const prevLiked = Boolean(target.user_liked);
    const prevCount = Math.max(0, Number(target.likes_count) || 0);
    target.user_liked = !prevLiked;
    target.likes_count = Math.max(0, prevCount + (target.user_liked ? 1 : -1));
    renderCommentsUI();

    const res = await toggleCommentLike(commentId);
    if (res && res.success) {
        const current = commentsState.comments.find(c => String(c.id) === String(commentId));
        if (current) {
            current.user_liked = Boolean(res.user_liked);
            current.likes_count = Math.max(0, Number(res.likes_count) || 0);
            renderCommentsUI();
        }
    } else {
        target.user_liked = prevLiked;
        target.likes_count = prevCount;
        renderCommentsUI();
    }
}

async function handleCommentDeleteClick(commentId) {
    if (!commentId) return;
    const cidStr = String(commentId);

    if (pendingDeleteCommentId !== cidStr) {
        pendingDeleteCommentId = cidStr;
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = setTimeout(() => {
            if (pendingDeleteCommentId === cidStr) {
                pendingDeleteCommentId = null;
                renderCommentsUI();
            }
        }, 4000);
        renderCommentsUI();
        return;
    }

    pendingDeleteCommentId = null;
    if (pendingDeleteTimer) {
        clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
    }

    const prevComments = [...commentsState.comments];
    const prevTotal = commentsState.totalCount;
    commentsState.comments = commentsState.comments.filter(c => String(c.id) !== cidStr);
    commentsState.totalCount = Math.max(0, commentsState.totalCount - 1);
    renderCommentsUI();

    const res = await deleteEpisodeComment(cidStr);
    if (!res || !res.success) {
        commentsState.comments = prevComments;
        commentsState.totalCount = prevTotal;
        renderCommentsUI();
        showCustomToast((res && res.error) || 'Failed to delete comment.', 'error');
        return;
    }
    showCustomToast('Comment deleted.', 'success');
}

function isWatchViewOpen() {
    const watchView = document.getElementById('watch-view');
    return Boolean(watchView && watchView.style.display !== 'none');
}

function getWatchRecommendationGroups(article) {
    const upNext = [];
    const more = [];
    const seen = new Set([article.id]);
    const currentEp = Number(article.epNumber) || 0;

    // Next 5 episodes strictly in incrementing episode order
    const upcomingAscending = masterArticlesList
        .filter(a => Number(a.epNumber) > currentEp && !seen.has(a.id))
        .sort((a, b) => Number(a.epNumber) - Number(b.epNumber))
        .slice(0, 5);

    for (const nextEp of upcomingAscending) {
        upNext.push(nextEp);
        seen.add(nextEp.id);
    }

    // Curated same-era / classic picks spaced deterministically from masterArticlesList
    const pool = masterArticlesList.filter(a => !seen.has(a.id));
    const sameCategory = pool.filter(a => a.category === article.category);
    const sourcePool = sameCategory.length >= 8 ? sameCategory : pool;
    const stepSize = Math.max(1, Math.floor(sourcePool.length / 10));
    const offset = currentEp % stepSize;

    for (let i = offset; i < sourcePool.length && more.length < 10; i += stepSize) {
        const pick = sourcePool[i];
        if (pick && !seen.has(pick.id)) {
            more.push(pick);
            seen.add(pick.id);
        }
    }

    return { upNext, more };
}

function createRecommendationCardHTML(art, context) {
    const isWatched = context.completedSet.has(art.id);
    const savedSec = context.timestamps[art.id] || 0;
    let epSecs = 1260;
    if (art.durationText) {
        const parts = art.durationText.split(':');
        if (parts.length === 3) epSecs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        else if (parts.length === 2) epSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    const progPct = savedSec > 0 ? Math.min(100, Math.round((savedSec / epSecs) * 100)) : 0;

    return `
        <button type="button" class="yt-rec-card" data-rec-ep-id="${escapeHTML(art.id)}">
            <div class="yt-rec-thumb-wrap">
                <img src="${escapeHTML(art.image)}" alt="${escapeHTML(art.title)}" loading="lazy" class="yt-rec-thumb" onerror="this.src='https://via.placeholder.com/320x180/18181b/818cf8?text=TMKOC'">
                <span class="yt-rec-dur">${escapeHTML(art.durationText || '21:45')}</span>
                ${isWatched ? '<span class="yt-rec-watched-tag">✓ Watched</span>' : ''}
                ${progPct > 0 ? `<div class="yt-rec-prog-bar"><div class="yt-rec-prog-fill" style="width: ${progPct}%;"></div></div>` : ''}
            </div>
            <div class="yt-rec-info">
                <h4 class="yt-rec-card-title">${escapeHTML(art.title)}</h4>
                <span class="yt-rec-card-meta">EP ${art.epNumber} • ${escapeHTML(art.airDate || art.category || '')}</span>
            </div>
        </button>
    `;
}

function renderWatchRecommendations(article) {
    const listEl = document.getElementById('watch-recommendations-list');
    if (!listEl) return;

    const { upNext, more } = getWatchRecommendationGroups(article);

    const context = {
        completedSet: new Set(getCompletedWatchedList()),
        timestamps: getTimestamps()
    };

    let html = '';
    if (upNext.length > 0) {
        html += `<div class="yt-rec-section-label">Next Episodes</div>`;
        html += upNext.map(art => createRecommendationCardHTML(art, context)).join('');
    }
    if (more.length > 0) {
        html += `<div class="yt-rec-section-label">Recommended For You</div>`;
        html += more.map(art => createRecommendationCardHTML(art, context)).join('');
    }

    listEl.innerHTML = html || '<div class="tmkoc-comments-empty">More episodes coming soon!</div>';
}

function bindWatchViewControls() {
    const watchView = document.getElementById('watch-view');
    if (!watchView || watchView.dataset.watchBound) return;
    watchView.dataset.watchBound = 'true';

    document.getElementById('watch-back-btn')?.addEventListener('click', () => {
        window.closeCleanPlayer();
    });

    document.getElementById('ep-like-btn')?.addEventListener('click', () => handleEpisodeReactionClick(1));
    document.getElementById('ep-dislike-btn')?.addEventListener('click', () => handleEpisodeReactionClick(-1));
    document.getElementById('ep-share-btn')?.addEventListener('click', handleEpisodeShareClick);

    document.getElementById('comment-insert-ts-btn')?.addEventListener('click', insertCurrentTimestampIntoComment);
    const composerAvatarBtn = document.getElementById('comment-composer-avatar-btn');
    const avatarTrayEl = document.getElementById('comment-avatar-tray');
    composerAvatarBtn?.addEventListener('click', () => {
        if (!avatarTrayEl) return;
        const willOpen = avatarTrayEl.style.display === 'none';
        if (willOpen) {
            avatarTrayEl.innerHTML = renderAvatarPickerHTML(getSelectedAvatarId(), true);
            avatarTrayEl.style.display = 'grid';
        } else {
            avatarTrayEl.style.display = 'none';
        }
    });
    avatarTrayEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-picker-option');
        if (!btn || !btn.dataset.avatarChoice) return;
        selectAndPersistAvatar(btn.dataset.avatarChoice);
    });

    const commentForm = document.getElementById('ep-comment-form');
    const commentInput = document.getElementById('ep-comment-input');
    const charCountEl = document.getElementById('ep-comment-char-count');

    commentForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleCommentFormSubmit();
    });
    commentInput?.addEventListener('input', () => {
        clearCommentError();
        if (charCountEl) {
            charCountEl.textContent = `${commentInput.value.length} / 500`;
        }
    });
    commentInput?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleCommentFormSubmit();
        }
    });
    commentInput?.addEventListener('focus', () => {
        expandCommentComposer();
    });
    document.getElementById('ep-comment-cancel')?.addEventListener('click', () => {
        collapseCommentComposer(true);
    });

    document.getElementById('ep-share-backdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'ep-share-backdrop') {
            closeSharePopover();
            return;
        }
        const targetBtn = e.target.closest('[data-share-platform]');
        if (targetBtn) {
            handleSocialShareClick(targetBtn.dataset.sharePlatform);
        }
    });
    document.getElementById('share-targets-track')?.addEventListener('scroll', updateShareScrollButtonState, { passive: true });
    document.getElementById('share-targets-prev')?.addEventListener('click', () => {
        const track = document.getElementById('share-targets-track');
        if (track) track.scrollBy({ left: -220, behavior: 'smooth' });
    });
    document.getElementById('share-targets-next')?.addEventListener('click', () => {
        const track = document.getElementById('share-targets-track');
        if (track) track.scrollBy({ left: 220, behavior: 'smooth' });
    });
    window.addEventListener('resize', () => {
        const backdrop = document.getElementById('ep-share-backdrop');
        if (backdrop && backdrop.style.display !== 'none') {
            updateShareScrollButtonState();
        }
    });
    document.getElementById('share-pop-close')?.addEventListener('click', () => {
        closeSharePopover();
    });
    document.getElementById('share-copy-btn')?.addEventListener('click', () => {
        handleShareCopyButtonClick();
    });
    document.getElementById('share-at-timestamp')?.addEventListener('change', () => {
        updateSharePopoverUrl();
    });
    document.getElementById('share-url-preview-input')?.addEventListener('click', (e) => {
        e.target.select();
    });
    document.getElementById('watch-desc-toggle')?.addEventListener('click', () => {
        const descEl = document.getElementById('clean-description');
        const toggleBtn = document.getElementById('watch-desc-toggle');
        if (!descEl || !toggleBtn) return;
        const shouldCollapse = !descEl.classList.contains('is-collapsed');
        descEl.classList.toggle('is-collapsed', shouldCollapse);
        toggleBtn.textContent = shouldCollapse ? '...more' : 'Show less';
        toggleBtn.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const backdrop = document.getElementById('ep-share-backdrop');
            if (backdrop && backdrop.style.display !== 'none') {
                closeSharePopover();
            }
        }
    });

    document.getElementById('comments-sort-top')?.addEventListener('click', () => {
        if (commentsState.sort === 'top') return;
        commentsState.sort = 'top';
        if (currentModalArticle) loadEpisodeComments(currentModalArticle.id, true);
    });
    document.getElementById('comments-sort-newest')?.addEventListener('click', () => {
        if (commentsState.sort === 'newest') return;
        commentsState.sort = 'newest';
        if (currentModalArticle) loadEpisodeComments(currentModalArticle.id, true);
    });
    document.getElementById('ep-comments-load-more')?.addEventListener('click', () => {
        if (currentModalArticle && !commentsState.loading) {
            loadEpisodeComments(currentModalArticle.id, false);
        }
    });

    document.getElementById('ep-comments-list')?.addEventListener('click', (e) => {
        const tsBtn = e.target.closest('.tmkoc-comment-ts');
        if (tsBtn) {
            seekPlayerToSeconds(Number(tsBtn.dataset.seekSec));
            return;
        }
        const likeBtn = e.target.closest('.tmkoc-comment-like-btn');
        if (likeBtn) {
            handleCommentLikeClick(likeBtn.dataset.commentId);
            return;
        }
        const deleteBtn = e.target.closest('.tmkoc-comment-delete-btn');
        if (deleteBtn) {
            handleCommentDeleteClick(deleteBtn.dataset.commentId);
        }
    });

    document.getElementById('watch-recommendations-list')?.addEventListener('click', (e) => {
        const recCard = e.target.closest('.yt-rec-card');
        if (recCard && recCard.dataset.recEpId) {
            window.playEpisode(recCard.dataset.recEpId);
        }
    });
}

function expandCommentComposer() {
    const inputEl = document.getElementById('ep-comment-input');
    const toolbarEl = document.getElementById('ep-comment-toolbar');
    if (inputEl && Number(inputEl.rows) < 2) inputEl.rows = 2;
    if (toolbarEl) toolbarEl.style.display = 'flex';
}

function collapseCommentComposer(clearText = false) {
    const inputEl = document.getElementById('ep-comment-input');
    const toolbarEl = document.getElementById('ep-comment-toolbar');
    const charCountEl = document.getElementById('ep-comment-char-count');
    const trayEl = document.getElementById('comment-avatar-tray');
    if (clearText && inputEl) {
        inputEl.value = '';
        if (charCountEl) charCountEl.textContent = '0 / 500';
        clearCommentError();
    }
    if (inputEl) inputEl.rows = 1;
    if (toolbarEl) toolbarEl.style.display = 'none';
    if (trayEl) trayEl.style.display = 'none';
    if (clearText) updateCommentSubmitButtonState();
}

function openCleanPlayer(article, options = {}) {
    playbackSessionId += 1;
    const activeSessionId = playbackSessionId;

    const wasWatchOpen = isWatchViewOpen();
    if (!wasWatchOpen) {
        savedFeedScrollY = window.scrollY || 0;
    }

    currentModalArticle = article;
    currentModalEpNum = article.epNumber;
    localStorage.setItem(STORAGE_LAST_OPENED, article.id);

    const initialTimestamps = getTimestamps();
    logActivity('watch', `Episode ${article.epNumber}`, initialTimestamps[article.id] || 0);

    ensureBackgroundAudioKeepAlive();
    bindWatchViewControls();

    const episodesView = document.getElementById('episodes-view');
    const dashboardView = document.getElementById('fan-dashboard-view');
    const profileView = document.getElementById('profile-view');
    const watchView = document.getElementById('watch-view');
    const headerBackBtn = document.getElementById('watch-back-btn');
    if (episodesView) episodesView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';
    if (profileView) profileView.style.display = 'none';
    if (watchView) watchView.style.display = 'block';
    if (headerBackBtn) headerBackBtn.style.display = 'inline-flex';
    document.body.style.overflow = 'auto';

    // Deactivate header nav & feed filter chips while watching a video
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));

    document.title = `EP ${article.epNumber}: ${article.title} - Daily Dose of TMKOC`;
    document.getElementById('clean-title').textContent = article.title;
    document.getElementById('clean-badge').textContent = `EP ${article.epNumber}`;

    const channelSubEl = document.getElementById('watch-channel-sub');
    if (channelSubEl) {
        channelSubEl.textContent = `${article.source || 'SONY SAB'} • ${article.airDate || 'Gokuldham Archive'}`;
    }

    const shareTsToggle = document.getElementById('share-at-timestamp');
    if (shareTsToggle) shareTsToggle.checked = false;
    const copyBtnEl = document.getElementById('share-copy-btn');
    if (copyBtnEl) {
        copyBtnEl.classList.remove('is-copied');
        copyBtnEl.textContent = 'Copy';
    }
    closeSharePopover();

    collapseCommentComposer(true);
    clearCommentError();
    updateComposerIdentity();
    updateCommentSubmitButtonState();

    const descMetaEl = document.getElementById('watch-description-meta');
    if (descMetaEl) {
        descMetaEl.textContent = `Episode ${article.epNumber}  •  ${article.category}  •  ${article.durationText || '21:45'}${article.airDate ? `  •  Aired ${article.airDate}` : ''}`;
    }

    const descEl = document.getElementById('clean-description');
    const descToggleBtn = document.getElementById('watch-desc-toggle');
    if (descEl) {
        descEl.textContent = article.description || '';
        descEl.style.display = article.description ? '' : 'none';
        descEl.classList.add('is-collapsed');
    }
    if (descToggleBtn) {
        descToggleBtn.textContent = '...more';
        descToggleBtn.setAttribute('aria-expanded', 'false');
        if (!article.description || !article.description.trim()) {
            descToggleBtn.style.display = 'none';
        } else {
            const updateDescToggleVisibility = () => {
                if (!descEl || !currentModalArticle || currentModalArticle.id !== article.id) return;
                const overflows = descEl.scrollHeight > descEl.clientHeight + 2;
                descToggleBtn.style.display = overflows ? 'inline-block' : 'none';
            };
            updateDescToggleVisibility();
            requestAnimationFrame(updateDescToggleVisibility);
        }
    }

    const autoplayToggle = document.getElementById('autoplay-toggle');
    if (autoplayToggle) {
        autoplayToggle.checked = localStorage.getItem('autoplayNext') !== 'false';
    }

    const timestamps = getTimestamps();
    const overrideSecs = Number(options?.startSecondsOverride) || 0;
    let resumeSeconds = overrideSecs > 0 ? Math.floor(overrideSecs) : (timestamps[article.id] || 0);

    // If opening an upgraded full episode after previously watching only a short clip, start fresh from 0:00!
    const completedShorts = getCompletedShortsList();
    const completedFull = getCompletedWatchedList();
    let epDurSecs = 1260;
    if (article.durationText) {
        const parts = article.durationText.split(':');
        if (parts.length === 3) epDurSecs = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        else if (parts.length === 2) epDurSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    if (overrideSecs <= 0 && completedShorts.includes(article.id) && !completedFull.includes(article.id) && epDurSecs >= 900 && resumeSeconds <= 720) {
        resumeSeconds = 0;
    }

    if (article.startTime && resumeSeconds < article.startTime) resumeSeconds = article.startTime;
    if (article.endTime && resumeSeconds > article.endTime) resumeSeconds = article.startTime;

    const candidates = getEpisodeCandidates(article);
    const chosenCandidate = getBestStartCandidate(candidates);

    currentActiveEpId = article.id;
    pendingManualSeek = { sec: 0, until: 0 };
    currentResumeSeconds = resumeSeconds;
    currentCandidates = candidates;
    currentActiveCandidate = chosenCandidate;
    currentPlayingVideoId = chosenCandidate ? chosenCandidate.videoId : '';
    sessionTriedVideoIds = new Set(chosenCandidate ? [chosenCandidate.videoId] : []);
    pendingAttachIframeSessionId = null;
    isMainPlayerLoading = Boolean(chosenCandidate);

    const shouldPushHistory = !wasWatchOpen && !options.fromPopState && !window.location.search.includes('ep=');
    syncUrlWithEpisode(article.epNumber, shouldPushHistory);
    updateShareTimestampLabel();
    updateCommentInsertTimestampLabel();
    loadEpisodeReactions(article.id);
    loadEpisodeComments(article.id, true);
    renderWatchRecommendations(article);

    window.scrollTo({ top: 0, behavior: 'auto' });

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

    // Ensure watch view is visible BEFORE instructing YouTube player so playback isn't throttled
    const watchViewEl = document.getElementById('watch-view');
    if (watchViewEl && watchViewEl.style.display === 'none') {
        watchViewEl.style.display = 'block';
    }
    document.body.style.overflow = 'auto';

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
                if (mutedForWarmReuse) {
                    mutedForWarmReuse = false;
                    try { ytPlayer.unMute(); } catch (e) {}
                }
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

        destroyMainPlayer();

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

            const playerToken = ytPlayerInstanceToken;
            ytPlayer = new window.YT.Player('clean-iframe-container', {
                host: 'https://www.youtube-nocookie.com',
                videoId: initialOpts.videoId,
                playerVars: pVars,
                events: createMainPlayerEvents(playerToken)
            });
            updateMediaSession(article);
        } else {
            isMainPlayerLoading = false;
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube-nocookie.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    } else {
        // YT API not ready yet: mount playable iframe immediately and attach JSAPI once API finishes
        renderDirectIframeFallback(viewport, chosenCandidate, resumeSeconds, article, activeSessionId);
    }

    startActiveWatchTracker(article.id);
}

window.openCleanPlayer = openCleanPlayer;

window.closeCleanPlayer = function(closeOptions = {}) {
    const wasOpen = isWatchViewOpen();
    if (!wasOpen && !currentModalArticle) {
        return;
    }

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

    closeSharePopover();
    const watchView = document.getElementById('watch-view');
    const headerBackBtn = document.getElementById('watch-back-btn');
    if (watchView) watchView.style.display = 'none';
    if (headerBackBtn) headerBackBtn.style.display = 'none';

    if (!closeOptions.skipScrollRestore) {
        const episodesView = document.getElementById('episodes-view');
        const dashboardView = document.getElementById('fan-dashboard-view');
        const profileView = document.getElementById('profile-view');
        if (episodesView) episodesView.style.display = 'block';
        if (dashboardView) dashboardView.style.display = 'none';
        if (profileView) profileView.style.display = 'none';
        const savedCategory = sessionStorage.getItem('currentCategory') || 'all';
        document.querySelectorAll('.filters .chip').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-category') === savedCategory);
        });
        window.scrollTo({ top: savedFeedScrollY || 0, behavior: 'auto' });
    }

    const iframeEl = getCleanIframeElement();
    if (ytPlayer && iframeEl && iframeEl.tagName === 'IFRAME' && isMainPlayerReady && !lastPlayerHadEndTime) {
        // Keep the player iframe warm (muted & stopped) for instantaneous switching on next click
        try {
            if (typeof ytPlayer.isMuted === 'function' && !ytPlayer.isMuted()) {
                mutedForWarmReuse = true;
                ytPlayer.mute();
            } else if (typeof ytPlayer.isMuted !== 'function') {
                mutedForWarmReuse = true;
                ytPlayer.mute();
            }
        } catch (e) {}
        try { ytPlayer.pauseVideo(); } catch (e) {}
        try { ytPlayer.stopVideo(); } catch (e) {}
    } else {
        destroyMainPlayer();
        const iframe = document.getElementById('clean-iframe');
        if (iframe) iframe.src = '';
    }

    document.title = DEFAULT_PAGE_TITLE;
    document.body.style.overflow = 'auto';
    stopBackgroundAudioKeepAlive();
    syncUrlWithEpisode(null, false);
    commentRequestSeq += 1;
    pendingDeleteCommentId = null;
    if (pendingDeleteTimer) {
        clearTimeout(pendingDeleteTimer);
        pendingDeleteTimer = null;
    }
    currentModalArticle = null;
    currentModalEpNum = null;
    currentActiveEpId = null;
    pendingManualSeek = { sec: 0, until: 0 };
    currentCandidates = [];
    currentActiveCandidate = null;
    currentPlayingVideoId = '';
    sessionTriedVideoIds = new Set();

    if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
    }
    stopActiveWatchTracker();
    updateFanDashboard();
    initialProbeUnlockTime = Math.max(initialProbeUnlockTime, Date.now() + 800);
    drainProbeQueues();
};

window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const ep = params.get('ep');
    if (ep) {
        const t = parseInt(params.get('t') || '0', 10) || 0;
        const clean = String(ep).trim();
        const numMatch = clean.match(/^(?:ep_)?(\d+)$/i);
        const numericEp = numMatch ? parseInt(numMatch[1], 10) : parseInt(clean, 10);
        const article = (numericEp && masterEpNumberMap[numericEp]) || allArticlesMap[clean] || (numericEp && allArticlesMap[`ep_${numericEp}`]);
        if (article) {
            openCleanPlayer(article, { startSecondsOverride: t, fromPopState: true });
        }
    } else if (isWatchViewOpen()) {
        window.closeCleanPlayer();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (isWatchViewOpen() && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
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
    if (handleInput && (!handleInput.value || document.activeElement !== handleInput)) {
        handleInput.value = savedHandle;
    }

    bindSidebarAvatarPicker();
    bindPhase4Controls();

    // Check if user's local handle is claimed by another user on the leaderboard
    if (savedHandle && !savedHandle.startsWith('Gokuldham resident') && savedHandle !== '@TMKOCSuperfan') {
        isHandleTaken(savedHandle, getOrCreateUserId(), watchedCount).then(taken => {
            const feedback = document.getElementById('handle-feedback');
            if (feedback) {
                if (taken) {
                    feedback.className = 'handle-feedback handle-feedback--error';
                    feedback.innerHTML = `⚠️ <span><strong>"${escapeHTML(savedHandle)}"</strong> is already claimed by another fan on the Leaderboard. Please choose a unique name!</span>`;
                    feedback.style.display = 'flex';
                } else {
                    feedback.style.display = 'none';
                    feedback.innerHTML = '';
                }
            }
        }).catch(() => {});
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

    // Profile Hero Identity Banner
    const heroAvatarSlot = document.getElementById('profile-hero-avatar');
    const heroNameEl = document.getElementById('profile-hero-name');
    const heroLevelEl = document.getElementById('profile-hero-level');
    const heroSummaryEl = document.getElementById('profile-hero-summary');
    if (heroAvatarSlot) {
        heroAvatarSlot.innerHTML = renderAvatarBadgeHTML(getSelectedAvatarId(), savedHandle, 'lg', 'profile-hero__avatar');
    }
    if (heroNameEl) heroNameEl.textContent = savedHandle;
    if (heroLevelEl) heroLevelEl.textContent = level.title;
    if (heroSummaryEl) {
        const epLabel = watchedCount === 1 ? 'Full Episode' : 'Full Episodes';
        const clipLabel = shortsCount === 1 ? 'Clip' : 'Clips';
        const streakLabel = currentStreak === 1 ? 'day' : 'days';
        const epText = shortsCount > 0 ? `${watchedCount} ${epLabel} • ${shortsCount} ${clipLabel}` : `${watchedCount} ${epLabel}`;
        heroSummaryEl.textContent = `${epText} • ${formatWatchTime(decimalHours)} • ${currentStreak} ${streakLabel} streak`;
    }

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

    // Profile: Recent Activity
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
    const effectiveAvatar = item.isUser ? getSelectedAvatarId() : normalizeAvatarId(item.avatarId || 'default');
    const avatarHtml = renderAvatarBadgeHTML(effectiveAvatar, item.handle, 'lg', 'lb-podium__avatar');

    return `
        <div class="lb-podium-card lb-podium-card--${colorClass}${item.isUser ? ' lb-podium-card--you' : ''}">
            <div class="lb-podium__top">
                <div class="lb-podium__rank lb-podium__rank--${colorClass}" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="${fillHex}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                </div>
                ${avatarHtml}
            </div>
            <div class="lb-podium__identity">
                <div class="lb-podium__handle">
                    ${escapeHTML(item.handle)}
                    ${item.isUser ? '<span class="lb-you-badge">YOU</span>' : ''}
                </div>
                <div class="lb-podium__level">${escapeHTML(item.level)}</div>
            </div>
            <div class="lb-podium__numbers">
                <div class="lb-podium__stats">${item.count} Eps</div>
                <div class="lb-podium__hours">${formatWatchTime(item.hours)}</div>
            </div>
        </div>
    `;
}

function createLeaderboardRowHTML(item, isHidden = false) {
    const hiddenStyle = isHidden ? ' style="display:none;"' : '';
    const extraClass = isHidden ? ' lb-row-hidden' : '';
    const effectiveAvatar = item.isUser ? getSelectedAvatarId() : normalizeAvatarId(item.avatarId || 'default');
    const avatarHtml = renderAvatarBadgeHTML(effectiveAvatar, item.handle, 'sm', 'lb-row__avatar');
    return `
        <div class="lb-row${item.isUser ? ' lb-row--you' : ''}${extraClass}"${hiddenStyle}>
            <div class="lb-row__left">
                <span class="lb-row__rank">#${item.rank}</span>
                ${avatarHtml}
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

    const statusEl = document.getElementById('leaderboard-status');
    if (statusEl) {
        statusEl.innerHTML = '';
        statusEl.style.display = 'none';
    }

    // Attempt cloud leaderboard fetch if Supabase is configured
    if (isConfigured) {
        leaderboardEl.innerHTML = `<div class="lb-loading">Loading rankings...</div>`;

        const leaderboardData = await fetchGlobalLeaderboard(50);
        if (leaderboardData && leaderboardData.fans && leaderboardData.fans.length > 0) {
            const globalFans = leaderboardData.fans;
            const totalCount = leaderboardData.totalCount;

            if (statusEl) {
                statusEl.innerHTML = '';
                statusEl.style.display = 'none';
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
                    // Show ranks #4-#15 immediately on the standalone Leaderboard page
                    rowsHtml += createLeaderboardRowHTML(item, index >= 12);
                });
                rowsHtml += '</div>';

                if (restFans.length > 12) {
                    rowsHtml += `<button id="lb-load-more" style="width: 100%; margin-top: 12px; border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--border-color); cursor: pointer; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Load More (Show Top 50)</button>`;
                }
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

let toastTimeout = null;
export function showCustomToast(message, type = 'error') {
    const toast = document.getElementById('custom-toast');
    const msgEl = document.getElementById('custom-toast-msg');
    const iconEl = document.getElementById('custom-toast-icon');
    if (!toast || !msgEl) return;

    if (toastTimeout) clearTimeout(toastTimeout);

    msgEl.textContent = message;
    toast.className = `custom-toast custom-toast--${type}`;
    if (iconEl) {
        iconEl.innerHTML = type === 'error' ? '⚠️' : '✓';
    }

    toast.style.display = 'flex';
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    toastTimeout = setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 3500);
}

window.saveUserHandle = async function() {
    const input = document.getElementById('user-handle-input');
    const btn = document.getElementById('save-handle-btn');
    const feedback = document.getElementById('handle-feedback');

    function setFeedback(msg, type = 'error') {
        if (feedback) {
            feedback.className = `handle-feedback handle-feedback--${type}`;
            feedback.innerHTML = `${type === 'error' ? '⚠️' : '✓'} <span>${escapeHTML(msg)}</span>`;
            feedback.style.display = 'flex';
        }
        if (type === 'error' && input) {
            input.classList.remove('input-shake');
            void input.offsetWidth;
            input.classList.add('input-shake');
            setTimeout(() => input.classList.remove('input-shake'), 450);
        }
        showCustomToast(msg, type);
    }

    if (!input || !input.value.trim()) {
        setFeedback('Please enter a username.', 'error');
        return;
    }

    const newHandle = input.value.trim();
    if (newHandle.length < 2) {
        setFeedback('Name must be at least 2 characters.', 'error');
        input.focus();
        return;
    }
    if (newHandle.length > 30) {
        setFeedback('Name must be 30 characters or less.', 'error');
        input.focus();
        return;
    }
    if (newHandle.toLowerCase().startsWith('gokuldham resident') || newHandle === '@TMKOCSuperfan') {
        setFeedback('Please choose a personalized name or nickname.', 'error');
        input.focus();
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Checking...';
        btn.style.opacity = '0.7';
    }
    if (feedback) feedback.style.display = 'none';

    try {
        const myEps = getCompletedWatchedList().length;
        const taken = await isHandleTaken(newHandle, getOrCreateUserId(), myEps);
        if (taken) {
            setFeedback(`"${newHandle}" is already taken by another fan. Please choose a unique name!`, 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Save';
                btn.style.opacity = '1';
            }
            input.focus();
            return;
        }
    } catch (e) {
        console.warn('Error checking handle uniqueness:', e);
    }

    localStorage.setItem(STORAGE_HANDLE, newHandle);
    localStorage.setItem(STORAGE_CUSTOM_NAME_SET, 'true');
    updateComposerIdentity();
    setFeedback(`Saved! Your leaderboard handle is now "${newHandle}".`, 'success');

    if (btn) {
        btn.textContent = 'Saved!';
        setTimeout(() => {
            btn.textContent = 'Save';
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 1200);
    }

    // Sync to cloud and update dashboard in background
    syncCurrentUserStats().then(() => updateFanDashboard()).catch(e => {
        console.warn('Sync error after saving handle:', e);
    });
};

export function hasUserSelectedCustomName() {
    if (localStorage.getItem(STORAGE_CUSTOM_NAME_SET) === 'true') {
        return true;
    }
    const current = (localStorage.getItem(STORAGE_HANDLE) || '').trim();
    if (current && !current.startsWith('Gokuldham resident') && current !== '@TMKOCSuperfan') {
        localStorage.setItem(STORAGE_CUSTOM_NAME_SET, 'true');
        return true;
    }
    return false;
}

export function initNamePromptModal() {
    if (hasUserSelectedCustomName()) return;

    const modal = document.getElementById('name-prompt-modal');
    if (!modal) return;

    const input = document.getElementById('name-prompt-input');
    const submitBtn = document.getElementById('name-prompt-submit-btn');
    const skipBtn = document.getElementById('name-prompt-skip-btn');
    const closeBtn = document.getElementById('name-prompt-close-btn');
    const errorEl = document.getElementById('name-prompt-error');
    const form = document.getElementById('name-prompt-form');
    const modalBadge = document.getElementById('name-prompt-badge');
    const modalAvatarGrid = document.getElementById('name-prompt-avatar-grid');
    const modalAvatarLabel = document.getElementById('modal-selected-avatar-name');
    let modalSelectedAvatar = getSelectedAvatarId();

    function updateModalAvatarPreview() {
        const info = getAvatarInfo(modalSelectedAvatar);
        if (modalAvatarLabel) {
            modalAvatarLabel.textContent = info ? info.name : 'Initial';
        }
        if (modalBadge) {
            if (info && info.photo) {
                modalBadge.innerHTML = `<img src="${escapeHTML(info.photo)}" alt="${escapeHTML(info.name)}" class="gokuldham-avatar-img">`;
                modalBadge.style.background = info.bg;
                modalBadge.style.borderColor = info.color;
            } else {
                modalBadge.innerHTML = `<span style="font-size: 28px;">🏆</span>`;
                modalBadge.style.background = '';
                modalBadge.style.borderColor = '';
            }
        }
        if (modalAvatarGrid) {
            modalAvatarGrid.innerHTML = renderAvatarPickerHTML(modalSelectedAvatar, true);
        }
    }

    if (modalAvatarGrid) {
        updateModalAvatarPreview();
        modalAvatarGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-picker-option');
            if (!btn || !btn.dataset.avatarChoice) return;
            modalSelectedAvatar = normalizeAvatarId(btn.dataset.avatarChoice);
            updateModalAvatarPreview();
        });
    }

    function closeModal() {
        modal.classList.remove('is-active');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    function openModal() {
        modal.style.display = 'flex';
        void modal.offsetWidth; // trigger reflow for smooth animation
        modal.classList.add('is-active');
        setTimeout(() => {
            if (input) input.focus();
        }, 150);
    }

    async function handleSave() {
        if (!input) return;
        const val = input.value.trim();
        if (!val || val.length < 2) {
            if (errorEl) {
                errorEl.textContent = 'Please enter at least 2 characters.';
                errorEl.style.display = 'block';
            }
            input.focus();
            return;
        }
        if (val.length > 30) {
            if (errorEl) {
                errorEl.textContent = 'Name must be 30 characters or less.';
                errorEl.style.display = 'block';
            }
            input.focus();
            return;
        }
        if (val.toLowerCase().startsWith('gokuldham resident') || val === '@TMKOCSuperfan') {
            if (errorEl) {
                errorEl.textContent = 'Please choose a personalized name or nickname.';
                errorEl.style.display = 'block';
            }
            input.focus();
            return;
        }

        if (errorEl) errorEl.style.display = 'none';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Checking availability...';
        }

        try {
            const myEps = getCompletedWatchedList().length;
            const taken = await isHandleTaken(val, getOrCreateUserId(), myEps);
            if (taken) {
                if (errorEl) {
                    errorEl.textContent = `"${val}" is already taken. Please choose a unique name!`;
                    errorEl.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Join Leaderboard';
                }
                input.focus();
                return;
            }
        } catch (e) {
            console.warn('Error checking handle uniqueness:', e);
        }

        // Save to localStorage
        localStorage.setItem(STORAGE_HANDLE, val);
        localStorage.setItem(STORAGE_CUSTOM_NAME_SET, 'true');
        setSelectedAvatarId(modalSelectedAvatar);
        refreshAvatarPickersUI();

        // Update sidebar input if present
        const sidebarInput = document.getElementById('user-handle-input');
        if (sidebarInput) sidebarInput.value = val;

        // Close modal immediately for instant feedback
        closeModal();

        // Sync with cloud and update dashboard in background
        syncCurrentUserStats().then(() => updateFanDashboard()).catch(e => {
            console.warn('Sync after name prompt error:', e);
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSave();
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSave();
        });
    }

    if (input) {
        input.addEventListener('input', () => {
            if (errorEl) errorEl.style.display = 'none';
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    // Close when clicking backdrop outside card
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Display after 600ms on page load (unless user is already watching an episode)
    setTimeout(() => {
        if (isWatchViewOpen()) {
            return;
        }
        openModal();
    }, 600);
}

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
        showCustomToast('Copied Social Share Card text to clipboard!', 'success');
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

// ----------------------------------------------------
// PHASE 4: SUPERFAN STATUS CARD
// ----------------------------------------------------
async function collectCurrentFanCardStats() {
    const completed = getCompletedWatchedList();
    const completedShorts = getCompletedShortsList();
    const watchedCount = completed.length;
    const shortsCount = completedShorts.length;
    const totalSecs = getExactWatchSeconds();
    const decimalHours = totalSecs / 3600;
    const streakData = getStreakData();
    const level = getFanLevel(watchedCount);
    const uniqueStarted = Object.keys(getTimestamps()).length;

    let rank = null;
    if (watchedCount > 0 || totalSecs > 0) {
        try {
            rank = await Promise.race([
                fetchUserGlobalRank(watchedCount, decimalHours),
                new Promise(resolve => setTimeout(() => resolve(null), 2500))
            ]);
        } catch (e) {
            rank = null;
        }
    }

    return {
        handle: getCurrentCommentHandle(),
        avatarId: getSelectedAvatarId(),
        rank: rank ? rank.toLocaleString() : null,
        watchedCount,
        shortsCount,
        uniqueStarted,
        watchTimeText: formatWatchTime(decimalHours),
        streakDays: Number(streakData.currentStreak) || 0,
        fanTier: level.title,
        dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };
}

async function triggerFanCardDownload(btnEl = null) {
    const originalText = btnEl ? btnEl.textContent.trim() : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Generating PNG...';
    }
    try {
        const stats = await collectCurrentFanCardStats();
        const filename = await downloadFanCardPNG(stats);
        showCustomToast(`Downloaded ${filename}!`, 'success');
    } catch (err) {
        console.error('Fan card download error:', err);
        showCustomToast('Could not generate status card. Please try again.', 'error');
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = originalText || 'Download Status Card';
        }
    }
}

async function openFanCardPreviewModal() {
    const modal = document.getElementById('fan-card-preview-modal');
    const canvas = document.getElementById('fan-card-preview-canvas');
    if (!modal || !canvas) return;

    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('is-active');
    modal.setAttribute('aria-hidden', 'false');

    try {
        const stats = await collectCurrentFanCardStats();
        await generateFanCardCanvas(stats, canvas);
    } catch (e) {
        console.error('Preview canvas error:', e);
        showCustomToast('Could not render preview card.', 'error');
    }
}

function closeFanCardPreviewModal() {
    const modal = document.getElementById('fan-card-preview-modal');
    if (!modal) return;
    modal.classList.remove('is-active');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 260);
}

function bindPhase4Controls() {
    const dlBtn = document.getElementById('download-fan-card-btn');
    if (dlBtn && !dlBtn.dataset.bound) {
        dlBtn.dataset.bound = 'true';
        dlBtn.addEventListener('click', () => triggerFanCardDownload(dlBtn));
    }

    const previewBtn = document.getElementById('preview-fan-card-btn');
    if (previewBtn && !previewBtn.dataset.bound) {
        previewBtn.dataset.bound = 'true';
        previewBtn.addEventListener('click', openFanCardPreviewModal);
    }

    const previewModal = document.getElementById('fan-card-preview-modal');
    if (previewModal && !previewModal.dataset.bound) {
        previewModal.dataset.bound = 'true';
        document.getElementById('fan-preview-close-btn')?.addEventListener('click', closeFanCardPreviewModal);
        document.getElementById('fan-preview-download-btn')?.addEventListener('click', (e) => triggerFanCardDownload(e.currentTarget));
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) closeFanCardPreviewModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewModal.classList.contains('is-active')) {
                closeFanCardPreviewModal();
            }
        });
    }
}

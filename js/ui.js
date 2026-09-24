/**
 * UI module for DailyDose TMKOC, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */
import { syncUserToCloud, fetchGlobalLeaderboard, isSupabaseConfigured, getOrCreateUserId } from './supabase.js';

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

let allArticlesMap = {};
let masterEpNumberMap = {};
let currentModalEpNum = null;

// LocalStorage Keys
const STORAGE_COMPLETED = 'tmkoc_completed_watched_eps'; // Only >= 90% completed
const STORAGE_TIMESTAMPS = 'tmkoc_timestamps';
const STORAGE_EXACT_WATCH_SECONDS = 'tmkoc_exact_watch_seconds';
const STORAGE_HANDLE = 'tmkoc_user_handle';
const STORAGE_STREAK = 'tmkoc_streak_data';
const STORAGE_ACTIVITY = 'tmkoc_activity_log';
const STORAGE_LAST_OPENED = 'tmkoc_last_opened';

let activeWatchTrackerTimer = null;
let currentActiveEpId = null;
window.userIsIndia = false;
let ytPlayer = null;

// Load YouTube IFrame API dynamically
const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
if(firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(ytScript, firstScriptTag);
} else {
    document.head.appendChild(ytScript);
}

// --- Background Geo-block Checker ---
let bgCheckerQueue = [];
let bgCheckerProcessing = false;
let checkObserver = null;
let bgCheckerTimeout = null;
const verifiedVideos = new Set();

// Remove initBgChecker completely as we create players on the fly
window.onYouTubeIframeAPIReady = function() {
    // API is ready. Trigger the queue if items are waiting.
    if (bgCheckerQueue.length > 0) processBgCheckerQueue();
};

function processBgCheckerQueue() {
    if (bgCheckerProcessing || bgCheckerQueue.length === 0 || !window.YT || !window.YT.Player) return;
    
    bgCheckerProcessing = true;
    const article = bgCheckerQueue[0];
    
    // Create temporary wrapper div (1x1) to prevent browser throttling of the iframe
    const wrapperDiv = document.createElement('div');
    wrapperDiv.id = 'bg-checker-wrapper';
    wrapperDiv.style.position = 'fixed';
    wrapperDiv.style.bottom = '0';
    wrapperDiv.style.right = '0';
    wrapperDiv.style.width = '1px';
    wrapperDiv.style.height = '1px';
    wrapperDiv.style.overflow = 'hidden';
    wrapperDiv.style.zIndex = '-9999';
    wrapperDiv.style.pointerEvents = 'none';
    
    const tempDiv = document.createElement('div');
    tempDiv.id = 'bg-checker-temp';
    wrapperDiv.appendChild(tempDiv);
    document.body.appendChild(wrapperDiv);

    let tempPlayer = null;
    let handled = false;

    function cleanupAndNext(isUnavailable) {
        if (handled) return;
        handled = true;
        if (bgCheckerTimeout) clearTimeout(bgCheckerTimeout);
        try { if (tempPlayer) tempPlayer.destroy(); } catch(e) {}
        try { 
            if (wrapperDiv && wrapperDiv.parentNode) {
                wrapperDiv.parentNode.removeChild(wrapperDiv);
            }
        } catch(e) {}
        
        handleCheckerResult(article, isUnavailable);
    }

    try {
        tempPlayer = new window.YT.Player('bg-checker-temp', {
            height: '200',
            width: '200',
            videoId: article.videoId,
            playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1, 'rel': 0, 'mute': 1, 'autoplay': 1 },
            events: {
                'onReady': function() {
                    // Grace period: if no error fires in 1.5s after ready, assume it's available
                    setTimeout(() => cleanupAndNext(false), 1500);
                },
                'onStateChange': function(event) {
                    if (event.data === window.YT.PlayerState.PLAYING || event.data === window.YT.PlayerState.BUFFERING) {
                        cleanupAndNext(false);
                    }
                },
                'onError': function(event) {
                    // Code 100, 101, 150
                    cleanupAndNext(true);
                }
            }
        });
        
        // Failsafe timeout in case YT hangs completely
        if (bgCheckerTimeout) clearTimeout(bgCheckerTimeout);
        bgCheckerTimeout = setTimeout(() => cleanupAndNext(false), 6000);
        
    } catch(e) {
        cleanupAndNext(false);
    }
}

export async function initializeIpCache() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        const currentIp = data.ip;
        
        const lastIp = localStorage.getItem("tmkoc_last_ip");
        if (lastIp && lastIp !== currentIp) {
            // IP changed (VPN toggled). Invalidate the geo cache.
            localStorage.removeItem("tmkoc_checker_cache");
        }
        localStorage.setItem("tmkoc_last_ip", currentIp);
    } catch (e) {}
}

function getCheckerCache() {
    try {
        const cache = JSON.parse(localStorage.getItem("tmkoc_checker_cache") || "{}");
        const now = Date.now();
        for (const key in cache) {
            if (now - cache[key].timestamp > 3600000) {
                delete cache[key];
            }
        }
        localStorage.setItem("tmkoc_checker_cache", JSON.stringify(cache));
        return cache;
    } catch(e) {
        return {};
    }
}

function setCheckerCache(videoId, isUnavailable) {
    try {
        const cache = getCheckerCache();
        cache[videoId] = {
            isUnavailable: isUnavailable,
            timestamp: Date.now()
        };
        localStorage.setItem("tmkoc_checker_cache", JSON.stringify(cache));
    } catch(e) {}
}

function handleCheckerResult(article, isUnavailable) {
    try {
        verifiedVideos.add(article.id);
        setCheckerCache(article.videoId, isUnavailable);
        
        const card = document.querySelector(`.card[data-id="${article.id}"]`);
        if (card) {
            if (isUnavailable && !article.fallbackId && !article.shortId) {
                card.classList.add('ep-unavailable');
            } else {
                card.classList.remove('ep-unavailable');
            }
            
            if (isUnavailable && !article.fallbackId && article.shortId) {
                const durationBadge = card.querySelector('.card-duration-badge');
                if (durationBadge) durationBadge.innerHTML = `10:00 <span style="font-size: 8px; opacity: 0.8; margin-left: 2px;">(SHORT)</span>`;
            }
        }
    } catch(e) {}
    
    bgCheckerQueue.shift();
    bgCheckerProcessing = false;
    setTimeout(processBgCheckerQueue, 250);
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
                    if (!verifiedVideos.has(article.id)) {
                        const cache = getCheckerCache();
                        if (cache[article.videoId]) {
                            verifiedVideos.add(article.id);
                            if (cache[article.videoId].isUnavailable) {
                                if (!article.fallbackId && !article.shortId) {
                                    card.classList.add('ep-unavailable');
                                } else if (!article.fallbackId && article.shortId) {
                                    const durationBadge = card.querySelector('.card-duration-badge');
                                    if (durationBadge) durationBadge.innerHTML = `10:00 <span style="font-size: 8px; opacity: 0.8; margin-left: 2px;">(SHORT)</span>`;
                                }
                            }
                        } else {
                            if (!bgCheckerQueue.some(a => a.id === article.id)) {
                                bgCheckerQueue.push(article);
                                processBgCheckerQueue();
                            }
                        }
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

function getExactWatchSeconds() {
    try {
        return parseInt(localStorage.getItem(STORAGE_EXACT_WATCH_SECONDS) || '0');
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
            if (completed.length === 0) return null;
            lastId = completed[completed.length - 1];
        }
        const article = allArticlesMap[lastId];
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
        const hours = parseFloat((totalSecs / 3600).toFixed(1));
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
            const article = allArticlesMap[id];
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
        elements.forEach(el => el.classList.add('read-article', 'watched-article'));
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
        if (completed.includes(article.id)) {
            readClass = 'read-article watched-article';
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

function createCardHTML(article) {
    allArticlesMap[article.id] = article;
    masterEpNumberMap[article.epNumber] = article;
    const imageUrl = article.image;
    
    let readClass = '';
    const completed = getCompletedWatchedList();
    if (completed.includes(article.id)) {
        readClass = 'read-article watched-article';
    }
    
    let unavailableClass = '';
    const cache = getCheckerCache();
    let displayDuration = article.durationText;
    
    if (cache[article.videoId] && cache[article.videoId].isUnavailable) {
        if (!article.fallbackId && !article.shortId) {
            unavailableClass = 'ep-unavailable';
        } else if (!article.fallbackId && article.shortId) {
            displayDuration = `10:00 <span style="font-size: 8px; opacity: 0.8; margin-left: 2px;">(SHORT)</span>`;
        }
    }

    const timestamps = getTimestamps();
    const savedTimeSec = timestamps[article.id] || 0;
    const progressPercent = savedTimeSec ? Math.min(100, Math.round((savedTimeSec / 1260) * 100)) : 0;
    
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

    if (!append) container.innerHTML = '';

    if (articles.length === 0 && !append) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No episodes found matching your search.</div>';
        return;
    }

    initIntersectionObserver();

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    articles.forEach(article => {
        tempDiv.innerHTML = createCardHTML(article);
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
            totalSecs += 1;
            currentEpSecs += 1;
            
            pendingExactWatchSeconds = totalSecs;
            
            timestamps[articleId] = currentEpSecs;
            pendingTimestamps = timestamps;

            const totalEpSecs = 1260; // 21 mins
            if (currentEpSecs >= totalEpSecs * 0.90) {
                saveCompletedEpisode(articleId);
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

function openCleanPlayer(article) {
    currentModalEpNum = article.epNumber;
    localStorage.setItem(STORAGE_LAST_OPENED, article.id);
    
    const initialTimestamps = getTimestamps();
    logActivity('watch', `Episode ${article.epNumber}`, initialTimestamps[article.id] || 0);

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
                    <button class="tmkoc-modal-close" onclick="closeCleanPlayer()">✕</button>
                </div>
                <div id="clean-modal-warning" class="tmkoc-geo-warning"></div>
                <div class="tmkoc-video-viewport">
                    <div id="clean-iframe-container"></div>
                </div>
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
        document.body.appendChild(backdrop);

    }

    const modalWarning = document.getElementById('clean-modal-warning');
    if (modalWarning) {
        modalWarning.style.display = 'none'; // Ensure it's hidden by default, ytPlayer onError will show it if needed
    }

    document.getElementById('clean-title').textContent = article.title;
    document.getElementById('clean-badge').textContent = `EP ${article.epNumber}`;

    const timestamps = getTimestamps();
    const resumeSeconds = timestamps[article.id] || 0;

    const viewport = document.querySelector('.tmkoc-video-viewport');
    
    if (window.YT && window.YT.Player) {
        if (ytPlayer) {
            ytPlayer.destroy();
        }
        viewport.innerHTML = '<div id="clean-iframe-container"></div>';
        
        let videoIdToPlay = article.videoId || '';
        let initialMsg = "";
        
        // INSTANT BYPASS: If the background checker already knows the main video is blocked,
        // instantly switch to fallback/short without waiting 10s for the player to error out!
        try {
            const cache = getCheckerCache();
            if (cache[article.videoId] && cache[article.videoId].isUnavailable) {
                if (article.fallbackId) {
                    videoIdToPlay = article.fallbackId;
                    if (!window._playbackAttempts) window._playbackAttempts = {};
                    window._playbackAttempts[article.id] = 1;
                    initialMsg = `⚠️ <strong>Switched to Backup Stream</strong>: The main video was blocked in your region, so we automatically pre-loaded the backup full episode!`;
                } else if (article.shortId) {
                    videoIdToPlay = article.shortId;
                    if (!window._playbackAttempts) window._playbackAttempts = {};
                    window._playbackAttempts[article.id] = 2;
                    initialMsg = `⚠️ <strong>Switched to Short Version</strong>: The full episode is geo-blocked, so we automatically pre-loaded the 10-minute promo/short version instead!`;
                }
            }
        } catch(e) {}
        
        if (videoIdToPlay) {
            ytPlayer = new window.YT.Player('clean-iframe-container', {
                videoId: videoIdToPlay,
                playerVars: { 
                    'autoplay': 1, 
                    'rel': 0, 
                    'controls': 1,
                    'start': resumeSeconds,
                    'modestbranding': 1,
                    'iv_load_policy': 3,
                    'color': 'white',
                    'playsinline': 1
                },
                events: {
                    'onReady': function(event) {
                        if (initialMsg && modalWarning) {
                            modalWarning.style.display = 'block';
                            modalWarning.innerHTML = initialMsg;
                        }
                    },
                    'onError': function(event) {
                        if (event.data === 150 || event.data === 101) {
                            if (!window._playbackAttempts) window._playbackAttempts = {};
                            const attempts = window._playbackAttempts[article.id] || 0;
                            
                            let nextVideoId = null;
                            let msg = "";
                            if (attempts === 0 && article.fallbackId) {
                                nextVideoId = article.fallbackId;
                                msg = `⚠️ <strong>Switched to Backup Stream</strong>: The main video was blocked in your region, attempting to load a backup full episode...`;
                            } else if (attempts <= 1 && article.shortId) {
                                nextVideoId = article.shortId;
                                msg = `⚠️ <strong>Switched to Short Version</strong>: The full episode is geo-blocked, so we automatically loaded the 10-minute promo/short version instead.`;
                            }
                            
                            if (nextVideoId) {
                                window._playbackAttempts[article.id] = attempts + 1;
                                
                                // YouTube's iframe often breaks completely (black screen) after a 150 error,
                                // so we must fully destroy and recreate the player with the new videoId
                                article.videoId = nextVideoId;
                                setTimeout(() => {
                                    openCleanPlayer(article);
                                    
                                    // Show the warning banner on the newly created player
                                    setTimeout(() => {
                                        const newWarning = document.getElementById('clean-modal-warning');
                                        if (newWarning) {
                                            newWarning.style.display = 'block';
                                            newWarning.innerHTML = msg;
                                        }
                                    }, 100);
                                }, 50);
                               
                                try {
                                    verifiedVideos.add(article.id);
                                    const card = document.querySelector(`.card[data-id="${article.id}"]`);
                                    if (card) card.classList.remove('ep-unavailable');
                                } catch(e) {}
                                return;
                            }
                        }
                        
                        if (modalWarning) {
                            modalWarning.style.display = 'block';
                            modalWarning.innerHTML = `⚠️ <strong>Video Unavailable:</strong> YouTube refused to play this video. It may be geo-blocked, made private, or Sony disabled embedding. <a href="https://www.youtube.com/results?search_query=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}" target="_blank" style="color: #d97706; text-decoration: underline;">Search for Ep ${article.epNumber} on YouTube</a>. (Code: ${event.data})`;
                        }
                        try {
                            verifiedVideos.add(article.id);
                            const card = document.querySelector(`.card[data-id="${article.id}"]`);
                            if (card && !card.classList.contains('ep-unavailable')) {
                                card.classList.add('ep-unavailable');
                            }
                        } catch(e) {}
                    },
                    'onStateChange': function(event) {
                        if (event.data === window.YT.PlayerState.PLAYING) {
                            currentActiveEpId = article.id;
                            try {
                                verifiedVideos.add(article.id);
                                const card = document.querySelector(`.card[data-id="${article.id}"]`);
                                if (card) card.classList.remove('ep-unavailable');
                            } catch(e) {}
                        } else if (event.data === window.YT.PlayerState.ENDED) {
                            if (localStorage.getItem('autoplayNext') !== 'false') {
                                window.navCleanEp(1);
                            }
                        }
                    }
                }
            });
        } else {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    } else {
        // Fallback if YT API fails to load
        const startParam = resumeSeconds > 5 ? `&start=${resumeSeconds}` : '';
        if (article.videoId) {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed/${article.videoId}?autoplay=1&rel=0&controls=1&modestbranding=1&iv_load_policy=3&color=white&playsinline=1${startParam}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
            viewport.innerHTML = `<iframe id="clean-iframe" src="https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}&modestbranding=1&rel=0&iv_load_policy=3&color=white&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        }
    }

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    startActiveWatchTracker(article.id);
}

window.closeCleanPlayer = function() {
    const backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    if (ytPlayer) {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }
    const iframe = document.getElementById('clean-iframe');
    if (iframe) iframe.src = '';
    document.body.style.overflow = 'auto';
    stopActiveWatchTracker();
    updateFanDashboard();
};

window.toggleAutoplay = function(checked) {
    localStorage.setItem('autoplayNext', checked);
};

window.navCleanEp = function(dir) {
    if (!currentModalEpNum) return;
    let targetEp = currentModalEpNum + dir;
    let iterations = 0;
    while (iterations < 50) {
        const targetArticle = masterEpNumberMap[targetEp];
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
    const watchedCount = completedList.length;

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
    if (cardMainStat) cardMainStat.textContent = `${watchedCount} Episodes Watched`;
    if (cardSubStat) cardSubStat.textContent = `${watchHours} Hours ${watchMins} Mins Exact Watch Time`;

    // Streak card
    const streakData = getStreakData();
    const currentStreak = streakData.currentStreak || 0;

    // Decimal hours for sidebar + leaderboard
    const decimalHours = parseFloat((totalWatchSecs / 3600).toFixed(2));

    // Sidebar: Quick Stats
    const qsEpisodes = document.getElementById('qs-episodes');
    const qsUnique = document.getElementById('qs-unique');
    const qsWatchTime = document.getElementById('qs-watch-time');
    const qsStreak = document.getElementById('qs-streak');
    const qsLevel = document.getElementById('qs-level');
    
    const uniqueStartedCount = Object.keys(getTimestamps()).length;
    
    if (qsEpisodes) qsEpisodes.textContent = watchedCount;
    if (qsUnique) qsUnique.textContent = uniqueStartedCount;
    if (qsWatchTime) qsWatchTime.textContent = `${decimalHours} hrs`;
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
        if (continueBtn) continueBtn.style.display = 'flex';
    }

    // Sidebar: Recent Activity
    const activityEl = document.getElementById('activity-list');
    if (activityEl) {
        const activities = getRecentActivity(5);
        if (activities.length === 0) {
            activityEl.innerHTML = '<div class="activity-empty">No activity yet. Watch an episode to get started!</div>';
        } else {
            activityEl.innerHTML = activities.map(a => {
                const iconClass = a.type === 'watch' ? 'activity-icon--watch' :
                                  a.type === 'streak' ? 'activity-icon--streak' :
                                  a.type === 'level' ? 'activity-icon--level' : 'activity-icon--watch';
                const icon = a.type === 'watch' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' :
                             a.type === 'streak' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z"></path></svg>' :
                             a.type === 'level' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>' : '';
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
                        <div class="activity-icon ${iconClass}">${icon}</div>
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
            <div class="lb-podium__level">${item.level}</div>
            <div class="lb-podium__stats">${item.count} Eps</div>
            <div class="lb-podium__hours">${item.hours} hrs</div>
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
                    <div class="lb-row__level">${item.level}</div>
                </div>
            </div>
            <div class="lb-row__right">
                <div class="lb-row__count">${item.count} Eps</div>
                <div class="lb-row__hours">${item.hours} hrs</div>
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

                rowsHtml += `<button id="lb-load-more" style="width: 100%; margin-top: 12px; border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.05); color: var(--text-primary); border: 1px solid var(--border-color); cursor: pointer; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Load More (Show Top 50)</button>`;
            }

            // If user has watch progress but didn't make top 50, show user card at bottom
            if (!userFoundInList && (userCount > 0 || userHours > 0)) {
                rowsHtml += `
                    <div class="lb-your-standing">
                        <div class="lb-your-standing__label">Your Standing</div>
                        ${createLeaderboardRowHTML({
                            rank: '-',
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
                    
                    // Reveal more dynamically until left height matches right height (with ~50px buffer)
                    // This creates the perfect alignment the user requested.
                    while (i < hiddenRows.length && lbSection.offsetHeight < (sidebar.offsetHeight - 50)) {
                        hiddenRows[i].style.display = 'flex';
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
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
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
    const count = completedList.length;
    const totalSecs = getExactWatchSeconds();
    const hours = parseFloat((totalSecs / 3600).toFixed(1));
    const level = getFanLevel(count);

    const shareText = `I've watched ${count} episodes (${hours} Hours) of TMKOC on Daily Dose! My Fan Level: ${level.title} (${handle}). Check your level at CodeMasterAbhishek.github.io/Daily-Dose-of-TMOCK/`;

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

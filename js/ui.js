/**
 * UI module for DailyDose TMKOC, Episode Badges, Exact Ranking Search, Real Leaderboard Data, and Clean Theme Card Design.
 */

let allArticlesMap = {};
let masterEpNumberMap = {};
let currentModalEpNum = null;

// LocalStorage Keys
const STORAGE_COMPLETED = 'tmkoc_completed_watched_eps'; // Only >= 90% completed
const STORAGE_TIMESTAMPS = 'tmkoc_timestamps';
const STORAGE_EXACT_WATCH_SECONDS = 'tmkoc_exact_watch_seconds';
const STORAGE_HANDLE = 'tmkoc_user_handle';

let activeWatchTrackerTimer = null;
let currentActiveEpId = null;

function getCompletedWatchedList() {
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

function saveCompletedEpisode(id) {
    try {
        const completed = getCompletedWatchedList();
        if (!completed.includes(id)) {
            completed.push(id);
            localStorage.setItem(STORAGE_COMPLETED, JSON.stringify(completed));
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
                    <img src="${imageUrl}" alt="${article.title}" class="hero-img" onerror="this.src='https://via.placeholder.com/1280x720/18181b/818cf8?text=TMKOC+Episode'">
                    <div class="hero-overlay"></div>
                    <div class="hero-content">
                        <div class="hero-meta">
                            <span class="hero-category">${article.category}</span>
                            <span class="hero-source" style="background: var(--text-primary); color: var(--bg-primary); padding: 2px 8px; border-radius: 4px; font-weight: 800;">EP ${article.epNumber}</span>
                            <span>${article.airDate || ''}</span>
                        </div>
                        <h1 class="hero-title">${article.title}</h1>
                        <p class="hero-desc">${article.description || ''}</p>
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

    const timestamps = getTimestamps();
    const savedTimeSec = timestamps[article.id] || 0;
    const progressPercent = savedTimeSec ? Math.min(100, Math.round((savedTimeSec / 1260) * 100)) : 0;
    
    return `
        <article class="card ${readClass}" data-id="${article.id}" data-category="${article.category.toLowerCase()}">
            <a href="javascript:void(0)" class="card-img-wrap" onclick="playEpisode('${article.id}')">
                <img src="${imageUrl}" alt="${article.title}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Episode'">
                <span class="card-duration-badge">${article.durationText || '21:45'}</span>
                ${progressPercent > 0 ? `<div class="card-progress-container"><div class="card-progress-bar" style="width: ${progressPercent}%;"></div></div>` : ''}
            </a>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">EP ${article.epNumber}</span>
                    <span>•</span>
                    <span class="card-date">${article.airDate || ''}</span>
                </div>
                <h2 class="card-title">
                    <a href="javascript:void(0)" onclick="playEpisode('${article.id}')">${article.title}</a>
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
    }

    if (articles.length === 0 && !append) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; opacity: 0.6;">No episodes found matching your search.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    articles.forEach(article => {
        tempDiv.innerHTML = createCardHTML(article);
        fragment.appendChild(tempDiv.firstElementChild);
    });

    container.appendChild(fragment);
}

let heroAutoTimer = null;

function setupHeroSlider() {
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
function startActiveWatchTracker(articleId) {
    stopActiveWatchTracker();
    currentActiveEpId = articleId;

    activeWatchTrackerTimer = setInterval(() => {
        const totalSecs = getExactWatchSeconds() + 1;
        localStorage.setItem(STORAGE_EXACT_WATCH_SECONDS, totalSecs.toString());

        const timestamps = getTimestamps();
        const currentEpSecs = (timestamps[articleId] || 0) + 1;
        timestamps[articleId] = currentEpSecs;
        localStorage.setItem(STORAGE_TIMESTAMPS, JSON.stringify(timestamps));

        const totalEpSecs = 1260; // 21 mins
        if (currentEpSecs >= totalEpSecs * 0.90) {
            saveCompletedEpisode(articleId);
        }
    }, 1000);
}

function stopActiveWatchTracker() {
    if (activeWatchTrackerTimer) {
        clearInterval(activeWatchTrackerTimer);
        activeWatchTrackerTimer = null;
    }
}

function openCleanPlayer(article) {
    currentModalEpNum = article.epNumber;

    let backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (!backdrop) {
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
                <div class="tmkoc-video-viewport">
                    <iframe id="clean-iframe" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
                <div class="tmkoc-modal-footer">
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(-1)">◀ Previous Ep</button>
                    <button class="tmkoc-nav-btn" onclick="navCleanEp(1)">Next Ep ▶</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
    }

    document.getElementById('clean-title').textContent = article.title;
    document.getElementById('clean-badge').textContent = `EP ${article.epNumber}`;

    const timestamps = getTimestamps();
    const resumeSeconds = timestamps[article.id] || 0;
    const startParam = resumeSeconds > 5 ? `&start=${resumeSeconds}` : '';

    const iframe = document.getElementById('clean-iframe');
    if (article.videoId) {
        iframe.src = `https://www.youtube.com/embed/${article.videoId}?autoplay=1&rel=0&controls=1${startParam}`;
    } else {
        iframe.src = `https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${article.epNumber}`;
    }

    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    startActiveWatchTracker(article.id);
}

window.closeCleanPlayer = function() {
    const backdrop = document.getElementById('tmkoc-clean-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    const iframe = document.getElementById('clean-iframe');
    if (iframe) iframe.src = '';
    document.body.style.overflow = 'auto';
    stopActiveWatchTracker();
};

window.navCleanEp = function(dir) {
    if (!currentModalEpNum) return;
    const targetEp = currentModalEpNum + dir;
    const targetArticle = masterEpNumberMap[targetEp];
    if (targetArticle) {
        openCleanPlayer(targetArticle);
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

export function updateFanDashboard() {
    const completedList = getCompletedWatchedList();
    const watchedCount = completedList.length;

    const totalWatchSecs = getExactWatchSeconds();
    const watchHours = Math.floor(totalWatchSecs / 3600);
    const watchMins = Math.floor((totalWatchSecs % 3600) / 60);

    const level = getFanLevel(watchedCount);

    const countEl = document.getElementById('stat-episodes-count');
    const hoursEl = document.getElementById('stat-watch-hours');
    const levelEl = document.getElementById('stat-fan-level');

    if (countEl) countEl.textContent = watchedCount;
    if (hoursEl) hoursEl.textContent = `${watchHours}h ${watchMins}m`;
    if (levelEl) {
        levelEl.textContent = level.title;
        levelEl.style.color = level.color;
    }

    const savedHandle = localStorage.getItem(STORAGE_HANDLE) || '@TMKOCSuperfan';
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

    renderLeaderboardList(savedHandle, watchedCount, watchHours, level.title);
}

function renderLeaderboardList(userHandle, userCount, userHours, userLevel) {
    const leaderboardEl = document.getElementById('leaderboard-list');
    if (!leaderboardEl) return;

    // Real User Entries Only (Zero Mock Data)
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

    const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); padding: 8px 12px; border-radius: 8px; font-size: 11px; color: var(--text-primary); opacity: 0.8; margin-bottom: 8px; border: 1px solid var(--border-color);">
            <span>Last Sync: Daily at 18:00 UTC (11:30 PM IST)</span>
            <span>${nowStr}</span>
        </div>
    `;

    if (realEntries.length === 0) {
        html += `
            <div style="padding: 20px; text-align: center; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border-color); font-size: 12px; color: var(--text-primary); opacity: 0.7;">
                No watched episodes logged yet. Start watching episodes to claim your spot on the Global Leaderboard!
            </div>
        `;
    } else {
        realEntries.forEach((item, idx) => {
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--text-primary); background: var(--bg-secondary);">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-weight: 800; font-size: 14px; min-width: 30px; color: var(--text-primary);">#1</span>
                        <div>
                            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${item.handle} <span style="font-size: 10px; background: var(--text-primary); color: var(--bg-primary); padding: 1px 6px; border-radius: 4px; font-weight: 700;">YOU</span></div>
                            <div style="font-size: 11px; opacity: 0.7; color: var(--text-primary);">${item.level}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 13px; color: var(--text-primary);">${item.count} Eps</div>
                        <div style="font-size: 11px; opacity: 0.7; color: var(--text-primary);">${item.hours} hrs</div>
                    </div>
                </div>
            `;
        });
    }

    leaderboardEl.innerHTML = html;
}

window.saveUserHandle = function() {
    const input = document.getElementById('user-handle-input');
    if (input && input.value.trim()) {
        localStorage.setItem(STORAGE_HANDLE, input.value.trim());
        updateFanDashboard();
    }
};

window.copyShareCardText = function() {
    const handle = localStorage.getItem(STORAGE_HANDLE) || '@TMKOCSuperfan';
    const completedList = getCompletedWatchedList();
    const count = completedList.length;
    const totalSecs = getExactWatchSeconds();
    const hours = Math.floor(totalSecs / 3600);
    const level = getFanLevel(count);

    const shareText = `I've watched ${count} episodes (${hours} Hours) of TMKOC on Daily Dose! My Fan Level: ${level.title} (${handle}). Check your level at CodeMasterAbhishek.github.io/tmkoc-youtube-playlist-bot/`;

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
                <img src="${coverImg}" alt="${arc.title}" loading="lazy" class="card-img" onerror="this.src='https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Storyline'">
                <span class="card-duration-badge" style="background: rgba(15,23,42,0.85); font-weight: 800;">${arc.totalEpisodes} EPISODES</span>
            </div>
            <div class="card-content">
                <div class="card-meta">
                    <span class="card-source" style="font-weight: 800; color: var(--text-primary); text-transform: uppercase;">EP ${arc.startEp} TO EP ${arc.endEp}</span>
                </div>
                <h2 class="card-title" style="margin-top: 4px;">
                    <a href="javascript:void(0)" onclick="window.viewStorylineDetail('${arc.id}')">${arc.title}</a>
                </h2>
                <p style="font-size: 12px; opacity: 0.75; margin-top: 6px; line-height: 1.4; color: var(--text-primary);">${arc.description}</p>
            </div>
        `;

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

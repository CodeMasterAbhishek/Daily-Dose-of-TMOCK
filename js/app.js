import { fetchNewsData, fetchStorylines } from './api.js';
import { renderArticles, renderStorylinesGrid, renderHeroContainer, registerMasterArticles, updateFanDashboard, initializeIpCache } from './ui.js';

// Setup current year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Theme Management (Light / Dark Mode matching DailyBrief)
const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
};

function setTheme(isDark) {
    if (isDark) {
        htmlEl.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.innerHTML = ICONS.sun;
        localStorage.setItem('theme', 'dark');
    } else {
        htmlEl.setAttribute('data-theme', 'light');
        if (themeToggle) themeToggle.innerHTML = ICONS.moon;
        localStorage.setItem('theme', 'light');
    }
}

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    setTheme(true);
} else {
    setTheme(false);
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isDark = htmlEl.getAttribute('data-theme') === 'dark';
        setTheme(!isDark);
    });
}

// State
let allArticles = [];
let allStorylines = [];
let activeStorylineArc = null;
let searchQuery = '';
let currentCategory = sessionStorage.getItem('currentCategory') || 'all';
const ITEMS_PER_PAGE = 30;
let currentPage = 1;

const paginationSection = document.getElementById('pagination');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const fanStatsBtn = document.getElementById('fan-stats-btn');
const fanModalBackdrop = document.getElementById('fan-modal-backdrop');

// Main Initialization
async function init() {
    const filterChips = document.querySelectorAll('.chip');
    filterChips.forEach(c => c.classList.remove('active'));
    const activeChip = document.querySelector(`.chip[data-category="${currentCategory}"]`);
    if (activeChip) activeChip.classList.add('active');

    try {
        await initializeIpCache();
        allArticles = await fetchNewsData();
        allStorylines = await fetchStorylines();
        
        registerMasterArticles(allArticles);
        renderPage();
    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById('news-container').innerHTML = '<p style="color:red">Failed to load dataset. Please try again later.</p>';
    }
}

function getFilteredAndRankedArticles() {
    if (activeStorylineArc) {
        return allArticles.filter(article => 
            article.epNumber >= activeStorylineArc.startEp && article.epNumber <= activeStorylineArc.endEp
        ).sort((a, b) => a.epNumber - b.epNumber); // Chronological sequence for storyline
    }

    return allArticles.filter(article => {
        let categoryMatch = true;
        if (currentCategory !== 'all') {
            categoryMatch = article.category.toLowerCase() === currentCategory.toLowerCase();
        }

        let searchMatch = true;
        if (searchQuery) {
            const epStr = article.epNumber.toString();
            const titleStr = article.title.toLowerCase();
            searchMatch = epStr === searchQuery || epStr.startsWith(searchQuery) || epStr.includes(searchQuery) || titleStr.includes(searchQuery);
        }

        return categoryMatch && searchMatch;
    }).sort((a, b) => {
        if (!searchQuery) {
            return b.epNumber - a.epNumber;
        }

        const epA = a.epNumber.toString();
        const epB = b.epNumber.toString();

        if (epA === searchQuery && epB !== searchQuery) return -1;
        if (epB === searchQuery && epA !== searchQuery) return 1;

        if (epA.startsWith(searchQuery) && !epB.startsWith(searchQuery)) return -1;
        if (epB.startsWith(searchQuery) && !epA.startsWith(searchQuery)) return 1;

        return b.epNumber - a.epNumber;
    });
}

function renderPage(append = false) {
    if (currentCategory === 'storylines' && !activeStorylineArc) {
        renderStorylinesGrid(allStorylines, 'news-container');
        if (paginationSection) paginationSection.style.display = 'none';
        return;
    }

    const filteredArticles = getFilteredAndRankedArticles();

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const articlesToShow = filteredArticles.slice(startIndex, endIndex);

    renderArticles(articlesToShow, 'news-container', append);

    if (endIndex < filteredArticles.length) {
        if (paginationSection) paginationSection.style.display = 'block';
    } else {
        if (paginationSection) paginationSection.style.display = 'none';
    }
}

// Storyline Selection Listener
window.addEventListener('selectStorylineArc', (e) => {
    activeStorylineArc = e.detail;
    currentPage = 1;
    renderPage(false);
});

// Fan Stats Modal Event Listener
if (fanStatsBtn) {
    fanStatsBtn.addEventListener('click', () => {
        updateFanDashboard();
        if (fanModalBackdrop) fanModalBackdrop.style.display = 'flex';
    });
}

// Expandable Circle Search Bar Handlers
const searchTriggerBtn = document.getElementById('search-trigger-btn');
const searchCloseBtn = document.getElementById('search-close-btn');

function openExpandableSearch() {
    if (searchForm) searchForm.classList.add('active');
    if (searchInput) searchInput.focus();
}

function closeExpandableSearch() {
    if (searchForm) searchForm.classList.remove('active');
    if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
    }
    currentPage = 1;
    renderPage(false);
}

if (searchTriggerBtn) {
    searchTriggerBtn.addEventListener('click', openExpandableSearch);
}

if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', closeExpandableSearch);
}

if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        searchQuery = searchInput.value.trim().toLowerCase();
        currentPage = 1;
        renderPage(false);
    });
}

if (searchInput) {
    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        currentPage = 1;
        renderPage(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            openExpandableSearch();
        } else if (e.key === 'Escape' && searchForm && searchForm.classList.contains('active')) {
            closeExpandableSearch();
        }
    });
}

// Category Chips Handler
const filterChips = document.querySelectorAll('.chip');
filterChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        activeStorylineArc = null;
        currentCategory = chip.getAttribute('data-category');
        sessionStorage.setItem('currentCategory', currentCategory);

        currentPage = 1;
        renderPage(false);
    });
});

// Infinite Scroll Listener
window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        const filteredArticles = getFilteredAndRankedArticles();

        if (currentPage * ITEMS_PER_PAGE < filteredArticles.length) {
            currentPage++;
            renderPage(true);
        }
    }
});

// Run Init
init();

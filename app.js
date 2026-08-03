// DailyBrief TMKOC Controller
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const sortOrder = document.getElementById('sortOrder');
  const categoryPills = document.querySelectorAll('.pill-btn');
  
  const heroCard = document.getElementById('heroCard');
  const heroImage = document.getElementById('heroImage');
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroEpBadge = document.getElementById('heroEpBadge');
  const heroPlayBtn = document.getElementById('heroPlayBtn');
  const heroPrevBtn = document.getElementById('heroPrevBtn');
  const heroNextBtn = document.getElementById('heroNextBtn');
  const heroDots = document.getElementById('heroDots');

  const episodeGrid = document.getElementById('episodeGrid');
  const resultsCount = document.getElementById('resultsCount');
  const sectionTitle = document.getElementById('sectionTitle');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  const playerModal = document.getElementById('playerModal');
  const modalTitle = document.getElementById('modalTitle');
  const youtubeIframe = document.getElementById('youtubeIframe');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const prevEpBtn = document.getElementById('prevEpBtn');
  const nextEpBtn = document.getElementById('nextEpBtn');
  const modalEpTag = document.getElementById('modalEpTag');

  // State
  let allEpisodes = [];
  let filteredEpisodes = [];
  let featuredEpisodes = [];
  let heroIndex = 0;
  let currentRenderCount = 24;
  let activeCategory = 'all';
  let currentSort = 'desc'; // Default to Newest First like DailyBrief
  let currentPlayingEp = null;

  // LocalStorage Keys
  const STORAGE_THEME = 'dailybrief_tmkoc_theme';
  const STORAGE_WATCHED = 'tmkoc_watched_eps';

  // 1. Theme Management (Light / Dark Mode)
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_THEME) || 'light';
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    }
  }

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode', !isDark);
    localStorage.setItem(STORAGE_THEME, isDark ? 'dark' : 'light');
  });

  // Extract Video ID
  function extractVideoId(url) {
    if (!url) return '';
    const match = url.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
    return match ? match[1] : '';
  }

  // Fetch Dataset
  async function loadData() {
    try {
      const response = await fetch('episodes.csv');
      if (!response.ok) throw new Error('Failed to fetch episodes.csv');
      
      const text = await response.text();
      const lines = text.split('\n');
      
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/^(\d+),"?([^",]+|"[^"]+")?"?,([^,]+),?([^,]+)?$/);
        let epNum = 0, title = '', url = '', status = 'Found';

        if (match) {
          epNum = parseInt(match[1]);
          title = (match[2] || '').replace(/^"|"$/g, '');
          url = match[3] || '';
          status = match[4] || 'Found';
        } else {
          const parts = line.split(',');
          epNum = parseInt(parts[0]);
          url = parts[2] || '';
          title = parts[1] || '';
        }

        if (epNum > 0) {
          const videoId = extractVideoId(url);
          parsed.push({
            ep: epNum,
            title: title || `Episode ${epNum} - Taarak Mehta Ka Ooltah Chashmah`,
            url: url,
            videoId: videoId,
            status: status
          });
        }
      }

      allEpisodes = parsed;
      setupHeroCarousel();
      applyFilters();

    } catch (err) {
      console.error('Error loading dataset:', err);
      episodeGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
          <h3>Failed to load episodes.csv</h3>
        </div>
      `;
    }
  }

  // 2. Hero Carousel Setup
  function setupHeroCarousel() {
    if (allEpisodes.length === 0) return;
    
    // Pick 4 featured latest/popular episodes for the hero carousel
    featuredEpisodes = allEpisodes.slice(-4).reverse();
    renderHeroSlide(0);

    // Auto-slide every 6 seconds
    setInterval(() => {
      heroIndex = (heroIndex + 1) % featuredEpisodes.length;
      renderHeroSlide(heroIndex);
    }, 6000);
  }

  function renderHeroSlide(index) {
    if (!featuredEpisodes[index]) return;
    const ep = featuredEpisodes[index];

    heroTitle.textContent = ep.title;
    heroEpBadge.textContent = `EPISODE ${ep.ep}`;
    
    const thumbUrl = ep.videoId 
      ? `https://img.youtube.com/vi/${ep.videoId}/maxresdefault.jpg`
      : 'https://via.placeholder.com/1280x720/1e293b/818cf8?text=TMKOC+Featured';
    
    heroImage.src = thumbUrl;
    
    // Update Dots
    heroDots.innerHTML = '';
    featuredEpisodes.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = `dot ${i === index ? 'active' : ''}`;
      dot.addEventListener('click', () => {
        heroIndex = i;
        renderHeroSlide(i);
      });
      heroDots.appendChild(dot);
    });

    heroPlayBtn.onclick = () => openPlayerModal(ep);
  }

  heroPrevBtn.addEventListener('click', () => {
    heroIndex = (heroIndex - 1 + featuredEpisodes.length) % featuredEpisodes.length;
    renderHeroSlide(heroIndex);
  });

  heroNextBtn.addEventListener('click', () => {
    heroIndex = (heroIndex + 1) % featuredEpisodes.length;
    renderHeroSlide(heroIndex);
  });

  // 3. Category & Filter Logic
  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();

    filteredEpisodes = allEpisodes.filter(item => {
      // Category Filter
      if (activeCategory === 'trending' && item.ep < 4450) return false;
      if (activeCategory === 'classic' && (item.ep < 1 || item.ep > 500)) return false;
      if (activeCategory === 'golden' && (item.ep < 501 || item.ep > 1500)) return false;
      if (activeCategory === 'modern' && (item.ep < 1501 || item.ep > 3000)) return false;
      if (activeCategory === 'recent' && item.ep < 3001) return false;

      // Search Query
      if (query) {
        const matchEp = item.ep.toString() === query || item.ep.toString().startsWith(query);
        const matchTitle = item.title.toLowerCase().includes(query);
        return matchEp || matchTitle;
      }

      return true;
    });

    // Sorting
    filteredEpisodes.sort((a, b) => {
      return currentSort === 'asc' ? a.ep - b.ep : b.ep - a.ep;
    });

    currentRenderCount = 24;
    renderGrid();
  }

  // 4. Render News Cards Grid
  function renderGrid() {
    episodeGrid.innerHTML = '';
    const itemsToRender = filteredEpisodes.slice(0, currentRenderCount);

    resultsCount.textContent = `Showing ${itemsToRender.length} of ${filteredEpisodes.length} stories`;

    if (itemsToRender.length === 0) {
      episodeGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <h3>No episodes found</h3>
          <p style="font-size: 13px; margin-top: 4px;">Try searching for another episode number or keyword.</p>
        </div>
      `;
      loadMoreBtn.classList.add('hidden');
      return;
    }

    itemsToRender.forEach(item => {
      const card = document.createElement('article');
      card.className = 'story-card';

      const thumbUrl = item.videoId 
        ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`
        : 'https://via.placeholder.com/480x270/1e293b/818cf8?text=TMKOC+Episode';

      card.innerHTML = `
        <div class="story-thumb">
          <img src="${thumbUrl}" alt="${item.title}" loading="lazy">
          <div class="card-play-icon">
            <div class="play-circle">▶</div>
          </div>
          <span class="story-ep-badge">EP ${item.ep}</span>
        </div>
        <div class="story-details">
          <div class="story-meta">
            <span class="story-source">SONY SAB</span> • <span>EPISODE ${item.ep}</span>
          </div>
          <h4 class="story-title">${item.title}</h4>
        </div>
      `;

      card.addEventListener('click', () => openPlayerModal(item));
      episodeGrid.appendChild(card);
    });

    if (currentRenderCount < filteredEpisodes.length) {
      loadMoreBtn.classList.remove('hidden');
    } else {
      loadMoreBtn.classList.add('hidden');
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    currentRenderCount += 24;
    renderGrid();
  });

  // 5. Modal Theatre Player
  function openPlayerModal(item) {
    if (!item) return;
    currentPlayingEp = item;

    modalTitle.textContent = item.title;
    modalEpTag.textContent = `Episode ${item.ep}`;

    if (item.videoId) {
      youtubeIframe.src = `https://www.youtube.com/embed/${item.videoId}?autoplay=1&rel=0`;
    } else {
      youtubeIframe.src = `https://www.youtube.com/embed?listType=search&list=Taarak+Mehta+Ka+Ooltah+Chashmah+Episode+${item.ep}`;
    }

    playerModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closePlayerModal() {
    playerModal.classList.add('hidden');
    youtubeIframe.src = '';
    document.body.style.overflow = 'auto';
  }

  prevEpBtn.addEventListener('click', () => {
    if (!currentPlayingEp) return;
    const prevObj = allEpisodes.find(e => e.ep === currentPlayingEp.ep - 1);
    if (prevObj) openPlayerModal(prevObj);
  });

  nextEpBtn.addEventListener('click', () => {
    if (!currentPlayingEp) return;
    const nextObj = allEpisodes.find(e => e.ep === currentPlayingEp.ep + 1);
    if (nextObj) openPlayerModal(nextObj);
  });

  closeModalBtn.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !playerModal.classList.contains('hidden')) {
      closePlayerModal();
    }
  });

  // Category Pills
  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.getAttribute('data-category');
      
      // Update section title
      sectionTitle.textContent = pill.textContent;
      applyFilters();
    });
  });

  // Search Input Events
  searchInput.addEventListener('input', () => {
    clearSearchBtn.classList.toggle('hidden', !searchInput.value.trim());
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    applyFilters();
  });

  sortOrder.addEventListener('change', () => {
    currentSort = sortOrder.value;
    applyFilters();
  });

  // Init
  initTheme();
  loadData();
});

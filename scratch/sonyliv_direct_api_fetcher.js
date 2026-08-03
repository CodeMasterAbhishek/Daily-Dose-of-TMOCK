/**
 * ⚡ INSTANT SONY LIV DIRECT API & STATE SCRAPER (Zero Lazy-Loading UI!)
 * Copy-paste this script into Chrome Console (F12 -> Console) on Sony LIV.
 * Bypasses all lazy-loading buttons, DOM rendering delays, and clicks!
 * Uses your active browser session token to fetch all episode descriptions directly into a JSON download!
 */

(async function fetchAllSonyLivEpisodesDirectly() {
  console.log("%c[⚡ Starting Sony LIV Direct API Fetcher...]", "color: #38bdf8; font-size: 16px; font-weight: bold;");

  // 1. Try to extract Next.js internal pageProps data
  let episodesMap = new Map();

  try {
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
      console.log("[Extractor] Found window.__NEXT_DATA__ state payload!");
      
      function searchObj(obj) {
        if (!obj) return;
        if (typeof obj === 'object') {
          const t = obj.title || '';
          const d = obj.description || obj.summary || obj.synopsis || '';
          const epNum = obj.episodeNumber;

          if (epNum && t && d && d.length > 20) {
            episodesMap.set(parseInt(epNum), {
              epNumber: parseInt(epNum),
              title: t,
              description: d,
              airDate: obj.broadcastDate || ''
            });
          }
          for (let k in obj) {
            searchObj(obj[k]);
          }
        } else if (Array.isArray(obj)) {
          obj.forEach(searchObj);
        }
      }

      searchObj(window.__NEXT_DATA__.props);
    }
  } catch (e) {
    console.log("[Extractor] Next.js state read note:", e);
  }

  // 2. Fetch via browser's authenticated session fetch()
  const showId = "1700000082"; // TMKOC Show ID
  let totalBatches = 48; // 48 batches of 100 episodes = ~4800 episodes

  console.log(`[API Fetcher] Direct-fetching episodes across batches using active browser session...`);

  for (let batch = 0; batch <= totalBatches; batch++) {
    const offset = batch * 100;
    const apiUrl = `https://apiv2.sonyliv.com/AGP/v1/linear/content/shows/${showId}/episodes?limit=100&offset=${offset}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        const json = await response.json();
        const items = json.resultObj || json.data || json.episodes || [];
        
        items.forEach(item => {
          const epNum = item.episodeNumber || item.episodeNo;
          if (epNum) {
            episodesMap.set(parseInt(epNum), {
              epNumber: parseInt(epNum),
              title: item.title || item.episodeTitle || '',
              description: item.description || item.synopsis || item.summary || '',
              airDate: item.broadcastDate || item.releaseDate || ''
            });
          }
        });
        console.log(`%c[Batch ${batch + 1}/${totalBatches + 1}] Fetched offset ${offset} -> Total Collected: ${episodesMap.size}`, "color: #059669; font-weight: bold;");
      }
    } catch (err) {
      console.log(`[Batch ${batch + 1}] Note: API fetch paused at offset ${offset}`);
    }

    await new Promise(r => setTimeout(r, 200)); // Ultra-fast 200ms pause
  }

  // 3. Fallback: Parse current DOM if API is restricted
  const text = document.body.innerText;
  const pattern = /E(\d+)\.\s*([^\n]+)\nE\1\s*•\s*([^\n•]+)\s*•\s*([^\n]+)\n([^\n]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const epNum = parseInt(match[1]);
    if (!episodesMap.has(epNum)) {
      episodesMap.set(epNum, {
        epNumber: epNum,
        title: match[2].trim(),
        airDate: match[3].trim(),
        duration: match[4].trim(),
        description: match[5].trim()
      });
    }
  }

  // 4. Download final dataset JSON
  const finalArray = Array.from(episodesMap.values()).sort((a, b) => a.epNumber - b.epNumber);
  const jsonStr = JSON.stringify(finalArray, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonyliv_DIRECT_FETCHED_dataset_${Date.now()}.json`;
  a.click();

  console.log(`%c[SUCCESS!] Downloaded ${finalArray.length} official episode synopses!`, "color: #38bdf8; font-size: 18px; font-weight: bold;");
  alert(`Successfully fetched & downloaded ${finalArray.length} official Sony LIV episode synopses!`);
})();

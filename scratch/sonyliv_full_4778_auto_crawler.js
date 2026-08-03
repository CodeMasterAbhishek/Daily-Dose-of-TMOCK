/**
 * 🚀 SONY LIV FULL 4,778 EPISODE CRAWLER (1-CLICK TOTAL AUTOMATION)
 * Paste this single script once into Chrome Console (F12 -> Console) on Sony LIV.
 * It will automatically loop through every tab (1-100 to 4701-4800), auto-click "View More Episodes",
 * collect all 4,778 episode descriptions, and automatically download the master JSON file!
 */

(async function autoCrawlAll4778Episodes() {
  console.log("%c[🚀 STARTING AUTOMATIC CRAWLER FOR ALL 4,778 EPISODES...]", "color: #059669; font-size: 18px; font-weight: bold;");

  let masterEpisodesMap = new Map();

  // Create live floating status overlay on page
  const overlay = document.createElement('div');
  overlay.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 999999; padding: 18px 24px; background: #0f172a; color: #38bdf8; border: 2px solid #2563eb; border-radius: 12px; font-family: sans-serif; font-size: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); font-weight: bold;";
  overlay.innerHTML = `<div>🎬 Crawling Sony LIV Episodes...</div><div id="crawl-status" style="font-size: 22px; margin-top: 6px; color: #fff;">0 / 4778 Episodes</div>`;
  document.body.appendChild(overlay);

  function updateStatusText(txt) {
    const el = document.getElementById('crawl-status');
    if (el) el.innerText = txt;
  }

  function extractVisibleDOM() {
    const text = document.body.innerText;
    const pattern = /E(\d+)\.\s*([^\n]+)\nE\1\s*•\s*([^\n•]+)\s*•\s*([^\n]+)\n([^\n]+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const epNum = parseInt(match[1]);
      if (!masterEpisodesMap.has(epNum)) {
        masterEpisodesMap.set(epNum, {
          epNumber: epNum,
          title: match[2].trim(),
          airDate: match[3].trim(),
          duration: match[4].trim(),
          description: match[5].trim()
        });
      }
    }
  }

  function findViewMoreBtn() {
    const candidates = Array.from(document.querySelectorAll('button, div, span, a, p'));
    return candidates.find(el => {
      if (!el || !el.innerText) return false;
      const txt = el.innerText.trim().toLowerCase();
      return (txt.includes('view more episodes') || txt.includes('load more') || txt.includes('view more')) && el.offsetHeight > 0;
    });
  }

  function getSortedTabElements() {
    const candidates = Array.from(document.querySelectorAll('button, div, span, li, a'));
    const tabs = candidates.filter(el => /^\d+-\d+$/.test(el.innerText ? el.innerText.trim() : ''));
    tabs.sort((a, b) => parseInt(a.innerText.split('-')[0]) - parseInt(b.innerText.split('-')[0]));
    return tabs;
  }

  const allTabs = getSortedTabElements();
  console.log(`Found ${allTabs.length} batch tabs to crawl!`);

  for (let i = 0; i < allTabs.length; i++) {
    const tabEl = allTabs[i];
    const tabName = tabEl.innerText.trim();
    updateStatusText(`Tab: ${tabName} (${masterEpisodesMap.size} Episodes)`);

    // 1. Click Tab
    tabEl.scrollIntoView({ behavior: 'auto', block: 'center' });
    tabEl.click();
    await new Promise(r => setTimeout(r, 1800)); // Wait for tab to switch

    // 2. Auto-click "View More Episodes" until all 100 episodes in this tab load
    let loadMoreAttempts = 0;
    while (loadMoreAttempts < 12) {
      extractVisibleDOM();
      updateStatusText(`Tab: ${tabName} | Scraped: ${masterEpisodesMap.size} Eps`);

      const viewMoreBtn = findViewMoreBtn();
      if (viewMoreBtn) {
        viewMoreBtn.scrollIntoView({ behavior: 'auto', block: 'center' });
        viewMoreBtn.click();
        await new Promise(r => setTimeout(r, 1200));
        loadMoreAttempts++;
      } else {
        break; // All episodes in this tab loaded
      }
    }

    extractVisibleDOM();
  }

  // Final Scrape
  extractVisibleDOM();

  // Download Master Dataset JSON
  const masterArray = Array.from(masterEpisodesMap.values()).sort((a, b) => a.epNumber - b.epNumber);
  const jsonStr = JSON.stringify(masterArray, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sonyliv_master_ALL_${masterArray.length}_episodes.json`;
  a.click();

  overlay.style.borderColor = "#059669";
  updateStatusText(`✅ COMPLETE! ${masterArray.length} Episodes Downloaded!`);
  alert(`🎉 SUCCESS! Downloaded ${masterArray.length} episode synopses into sonyliv_master_ALL_${masterArray.length}_episodes.json!`);
})();

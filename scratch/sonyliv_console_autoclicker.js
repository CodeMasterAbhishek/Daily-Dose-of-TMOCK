/**
 * SONY LIV AUTO-CLICKER CONSOLE SCRIPT (React Event Dispatcher Version)
 * Copy-paste this entire script into Chrome/Brave Console (F12 -> Console) on Sony LIV page.
 */

(async function startSonyLivAutoScraper() {
  console.log("%c[Sony LIV Auto Scraper Started!]", "color: #059669; font-size: 16px; font-weight: bold;");
  
  let masterMap = new Map();
  let isRunning = true;
  let tabIdx = 0;

  // Add floating stop button
  const stopBtn = document.createElement('button');
  stopBtn.innerText = "⏹ STOP & DOWNLOAD JSON";
  stopBtn.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 99999; padding: 14px 24px; background: #dc2626; color: white; border: none; border-radius: 50px; font-weight: bold; cursor: pointer; font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.4);";
  document.body.appendChild(stopBtn);

  stopBtn.onclick = () => {
    isRunning = false;
    stopBtn.innerText = "Exporting...";
    downloadData();
  };

  function triggerClick(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
      if (typeof PointerEvent !== 'undefined') {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      el.click();
    } catch(e) {}
  }

  function downloadData() {
    const list = Array.from(masterMap.values()).sort((a, b) => a.epNumber - b.epNumber);
    const jsonStr = JSON.stringify(list, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonyliv_TMKOC_master_dataset_${Date.now()}.json`;
    a.click();
    alert(`Downloaded ${list.length} official Sony LIV episode synopses!`);
  }

  while (isRunning) {
    // Extract episodes
    const text = document.body.innerText;
    const pattern = /E(\d+)\.\s*([^\n]+)\nE\1\s*•\s*([^\n•]+)\s*•\s*([^\n]+)\n([^\n]+)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const epNum = parseInt(match[1]);
      if (!masterMap.has(epNum)) {
        masterMap.set(epNum, {
          epNumber: epNum,
          title: match[2].trim(),
          airDate: match[3].trim(),
          duration: match[4].trim(),
          description: match[5].trim()
        });
      }
    }

    stopBtn.innerText = `⏹ STOP & DOWNLOAD (${masterMap.size} EPS)`;

    // Find View More button
    const candidates = Array.from(document.querySelectorAll('button, div, span, a, p'));
    const viewMoreBtn = candidates.find(el => {
      if (!el || !el.innerText) return false;
      const txt = el.innerText.trim().toLowerCase();
      const isMatch = txt.includes('view more episodes') || txt.includes('view more') || txt.includes('load more');
      return isMatch && el.offsetHeight > 0;
    });

    if (viewMoreBtn && isRunning) {
      triggerClick(viewMoreBtn);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s for network load
      continue;
    }

    // Switch tab if no load more button
    const tabs = Array.from(document.querySelectorAll('button, div, span, li, a')).filter(el => /^\d+-\d+$/.test(el.innerText ? el.innerText.trim() : ''));
    tabs.sort((a, b) => parseInt(a.innerText.split('-')[0]) - parseInt(b.innerText.split('-')[0]));

    if (tabs.length > 0 && tabIdx < tabs.length && isRunning) {
      const nextTab = tabs[tabIdx];
      tabIdx++;
      triggerClick(nextTab);
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }

    await new Promise(r => setTimeout(r, 1500));
  }
})();

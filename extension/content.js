/**
 * Sony LIV Manual TMKOC Episode DOM Scraper (Zero Auto-Clicking!)
 * Scrapes all currently loaded episode titles, numbers, air dates, runtimes, and descriptions.
 */

let scrapedEpisodesMap = new Map();

function extractLoadedEpisodes() {
  const text = document.body.innerText;
  const pattern = /E(\d+)\.\s*([^\n]+)\nE\1\s*•\s*([^\n•]+)\s*•\s*([^\n]+)\n([^\n]+)/g;
  let match;

  let newlyAdded = 0;
  while ((match = pattern.exec(text)) !== null) {
    const epNum = parseInt(match[1]);
    if (!scrapedEpisodesMap.has(epNum)) {
      scrapedEpisodesMap.set(epNum, {
        epNumber: epNum,
        title: match[2].trim(),
        airDate: match[3].trim(),
        duration: match[4].trim(),
        description: match[5].trim()
      });
      newlyAdded++;
    }
  }

  const allEpisodes = Array.from(scrapedEpisodesMap.values()).sort((a, b) => a.epNumber - b.epNumber);
  return { newlyAdded, totalScraped: allEpisodes.length, data: allEpisodes };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_now") {
    const result = extractLoadedEpisodes();
    sendResponse({ status: "success", count: result.totalScraped, newlyAdded: result.newlyAdded, data: result.data });
  } else if (request.action === "export_json") {
    const finalData = Array.from(scrapedEpisodesMap.values()).sort((a, b) => a.epNumber - b.epNumber);
    sendResponse({ status: "success", count: finalData.length, data: finalData });
  } else if (request.action === "clear_data") {
    scrapedEpisodesMap.clear();
    sendResponse({ status: "cleared", count: 0 });
  }
  return true;
});

/**
 * Manual Popup Handler (Zero Auto-Clicking!)
 */

const scrapeBtn = document.getElementById('scrape-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const epCountEl = document.getElementById('ep-count');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

scrapeBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "scrape_now" }, (res) => {
    if (chrome.runtime.lastError) {
      alert("Please open Sony LIV page first!");
      return;
    }
    if (res) {
      epCountEl.innerText = res.count || 0;
    }
  });
});

downloadBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "export_json" }, (res) => {
    if (res && res.data && res.data.length > 0) {
      const jsonStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sonyliv_manual_scraped_${Date.now()}.json`;
      a.click();
    } else {
      alert("No episodes saved yet! Click 'Record Visible Episodes' first.");
    }
  });
});

clearBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "clear_data" }, (res) => {
    epCountEl.innerText = "0";
  });
});

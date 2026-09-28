<div align="center">
  <h1>Daily Dose of Taarak Mehta Ka Ooltah Chashmah. 🚂</h1>
  <a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-TMOCK/" target="_blank" rel="noopener noreferrer">
    <img src="assets/TMKOC-Logo.png?v=2" alt="TMKOC Logo" width="800" />
  </a>
  <p>A fast, serverless web application that aggregates all episodes of Taarak Mehta Ka Ooltah Chashmah, powered entirely by GitHub Pages and Actions.</p>

  <a href="https://github.com/CodeMasterAbhishek/Daily-Dose-of-TMOCK/actions/workflows/daily_sync.yml" target="_blank" rel="noopener noreferrer">
    <img src="https://github.com/CodeMasterAbhishek/Daily-Dose-of-TMOCK/actions/workflows/daily_sync.yml/badge.svg" alt="Daily Sync Status">
  </a>
  <a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-TMOCK/" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/Platform-GitHub%20Pages-success.svg" alt="GitHub Pages">
  </a>

  <h3><a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-TMOCK/" target="_blank" rel="noopener noreferrer">View Live Website</a></h3>
</div>

---

## What is this?

**Daily Dose of TMKOC** is a serverless web application built to organize and stream all 4,500+ episodes of the iconic Indian sitcom *Taarak Mehta Ka Ooltah Chashmah*. 

With thousands of episodes spanning over a decade, official YouTube playlists often become fragmented, incomplete, or difficult to navigate for specific storylines. Relying on traditional backend servers and databases to track this massive catalogue would incur constant hosting costs. 

This project solves these issues by acting as a highly optimized, specialized streaming frontend. It utilizes a **100% free, serverless architecture** where GitHub serves as both the automation backend (via Actions) and the database/CDN (via Pages and static files). A custom Python scraper natively fetches new episodes daily, updates a flat-file database, and triggers live deployments instantly.

---

## Built With

The project embraces a lightweight, no-framework philosophy, leaning heavily on native web technologies and robust Python libraries. Every technology is linked to its official documentation below:

*   **Frontend:**
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/HTML" target="_blank" rel="noopener noreferrer">HTML5</a> for semantic structure.
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/CSS" target="_blank" rel="noopener noreferrer">Vanilla CSS</a> for styling (avoiding heavy UI frameworks).
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank" rel="noopener noreferrer">Vanilla JavaScript</a> for DOM manipulation and logic.
    *   <a href="https://developers.google.com/youtube/iframe_api_reference" target="_blank" rel="noopener noreferrer">YouTube IFrame Player API</a> for building the custom video player interface.
*   **Backend & Automation:**
    *   <a href="https://www.python.org/doc/" target="_blank" rel="noopener noreferrer">Python</a> as the core scripting language.
    *   <a href="https://github.com/dermasmid/scrapetube" target="_blank" rel="noopener noreferrer">scrapetube</a> for scraping YouTube channel data natively (bypassing strict YouTube Data API quotas).
    *   <a href="https://requests.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">Requests</a> for handling automated HTTP calls.
*   **Infrastructure & APIs:**
    *   <a href="https://docs.github.com/en/actions" target="_blank" rel="noopener noreferrer">GitHub Actions</a> for the scheduled cron job orchestrator.
    *   <a href="https://pages.github.com/" target="_blank" rel="noopener noreferrer">GitHub Pages</a> for free, globally distributed static hosting.
    *   <a href="https://www.ipify.org/" target="_blank" rel="noopener noreferrer">ipify API</a> for retrieving the user's public IP address to manage smart geo-caching.

---

## Architecture & Detailed Explanation
### 1. The "Zero-Cost" Database Layer
Instead of using a traditional database, the entire catalogue of 4,800+ episodes is stored in a simple, highly optimized static \episodes.csv\ file. 
*   **Why?** A flat file can be served instantaneously by GitHub's globally distributed CDN. 
*   When a user loads the app, the frontend asynchronously fetches the \.csv\ file, parses it into JSON objects locally in the browser, and renders the interface. This completely eliminates database querying latency and traditional backend hosting costs.

### 2. Multi-Tiered Self-Healing Scraper
Official YouTube channels frequently geo-block, delete, or re-upload episodes, leading to dead links. We bypass this entirely with a resilient auto-scraper running via <a href="https://docs.github.com/en/actions" target="_blank" rel="noopener noreferrer">GitHub Actions</a>.
1.  **Expanded Channel Polling**: Every 6 hours, our \update_website.py\ script utilizes \scrapetube\ to concurrently poll **6 official channels** (Sony SAB, Sony Pal, TMKOC Episodes, TMKOC Movies, LIV Comedy, etc.) to capture new releases.
2.  **Cascading Fallbacks**: The backend aggressively searches for 3 distinct video tiers for *every* episode: 
    - The Primary Full Episode (20+ minutes)
    - A Fallback Full Episode (Hosted on secondary channels)
    - A "Short" Version (10-minute highlights commonly available in geo-blocked regions like India)
3.  **Auto-Commit & Deploy**: If new episodes or better fallbacks are discovered, the bot automatically commits changes to \episodes.csv\. GitHub Pages instantly deploys the updated links to all global users.

### 3. Asynchronous Background Pre-Checking & Smart Routing
Because YouTube heavily geo-blocks certain TMKOC episodes in specific countries (returning a fatal \150\ iframe crash), relying on a static database isn't enough. We built a proactive, invisible frontend architecture to solve this:
*   **IntersectionObserver Queuing**: As the user scrolls, off-screen episodes are pushed into a \gCheckerQueue\.
*   **Invisible Headless Player**: A hidden 200x200 YouTube iframe silently loads queued video IDs in the background. If the video fails (Error 150/101), the frontend instantly marks it as "unavailable" and caches this state.
*   **Instant Cascading Fallbacks**: If a user clicks an episode where the primary link is blocked, the custom UI instantly destroys the main player, bypasses the dead link, and reroutes them to the Fallback or Short version without any black screens or loading delays. The video duration badge dynamically updates to reflect the shorter runtime (\~10:00 (Short)\).
*   **IP-Aware Caching**: Results are stored in \localStorage\. Using the <a href="https://www.ipify.org/" target="_blank" rel="noopener noreferrer">ipify API</a>, if the user toggles a VPN or changes networks, the cache is instantly invalidated and episodes are re-verified for the new region.

---

## Core Features

- **Cascading Smart Routing:** Automatically falls back to alternative uploads or 10-minute short versions instantly if an episode is geo-blocked in your country.
- **Fan Stats Dashboard:** Client-side analytics leveraging \localStorage\ to track your watched episodes, calculate total hours spent watching, and measure your completion percentage across 16+ years of content.
- **Custom Video Player:** A bespoke player built on top of the <a href="https://developers.google.com/youtube/iframe_api_reference" target="_blank" rel="noopener noreferrer">YouTube IFrame API</a> featuring custom scrubbing, speed adjustments (0.75x to 2x), and instant Next/Previous navigation.
- **Curated "Storylines":** Dedicated section grouping multi-episode arcs for binge-watching. Episodes inside a storyline strictly override global sorting mechanisms to force chronological viewing.
- **$0 Running Costs:** Completely hosted and automated on GitHub's ecosystem.



## Disclaimer
This project is a non-commercial, fan-made directory. All "Taarak Mehta Ka Ooltah Chashmah" (TMKOC) episodes, characters, videos, and trademarks are the exclusive property of **Sony Pictures Networks India**, **SAB TV**, **Neela Film Productions Pvt. Ltd.**, and their respective copyright owners. 

This repository does not host or pirate any video content. All videos are embedded directly from official YouTube channels using the authorized YouTube IFrame Player API.

**Notice for Copyright Holders (Sony / SAB TV / Neela Film Productions):**
This project was built strictly out of love and respect for TMKOC to help fans easily find official episodes. If you represent the copyright holders and have any questions, concerns, or requests regarding this directory, please feel free to reach out directly:
**Email:** codemasterabhishek@gmail.com

## License
**All rights reserved.** This software is proprietary and is not open-source. You may not use, copy, modify, distribute, or sell this software code without prior explicit written permission from the owner. 

To request permission for usage, please contact: **codemasterabhishek@gmail.com**

See the `LICENSE` file for full legal details and restrictions.

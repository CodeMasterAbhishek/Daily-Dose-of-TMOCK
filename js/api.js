/**
 * API module for fetching TMKOC dataset and transforming into DailyDose article objects.
 */

function extractVideoId(url) {
    if (!url) return '';
    const match = url.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
    return match ? match[1] : '';
}

function getCategoryForEp(epNum) {
    if (epNum <= 500) return 'Classic';
    if (epNum <= 1500) return 'Golden';
    if (epNum <= 3000) return 'Modern';
    return 'Recent';
}

function getAirDateForEp(epNum) {
    // Generate realistic air date based on episode number
    const startDate = new Date(2008, 6, 28); // July 28, 2008 (Ep 1 premiere)
    const daysOffset = Math.floor(epNum * 1.378);
    const epDate = new Date(startDate.getTime() + daysOffset * 86400000);
    return epDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function extractRealEpNumber(title, csvEpNum) {
    if (!title) return csvEpNum;
    const match = title.match(/(?:full\s+)?(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d{1,4})/i);
    if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 0 && parsed <= 4999) {
            return parsed;
        }
    }
    return csvEpNum;
}

function extractRealDate(title, epNum) {
    if (!title) return getAirDateForEp(epNum);
    const dateMatch = title.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(20\d{2})\b/);
    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].substring(0, 3);
        const year = dateMatch[3];
        return `${day} ${month} ${year}`;
    }
    return getAirDateForEp(epNum);
}

export async function fetchNewsData() {
    try {
        const cacheBuster = Math.floor(Date.now() / 600000); // 10 minutes cache for episodes
        const response = await fetch(`data/episodes.csv?t=${cacheBuster}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const lines = text.split('\n');

        const articles = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    if (inQuotes && line[j + 1] === '"') {
                        current += '"';
                        j++; // skip the escaped quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    parts.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            parts.push(current);
            
            const epNum = parseInt(parts[0] || '0');
            const title = (parts[1] || '').trim();
            const url = (parts[2] || '').trim();
            const status = (parts[3] || 'Found').trim();
            const csvDate = (parts[4] || '').trim();
            const csvDuration = (parts[5] || '').trim();
            const csvFallbackUrl = (parts[6] || '').trim();
            const csvShortUrl = (parts[7] || '').trim();

            if (epNum > 0) {
                const realEpNum = extractRealEpNumber(title, epNum);
                const videoId = extractVideoId(url);
                const fallbackId = extractVideoId(csvFallbackUrl);
                const shortId = extractVideoId(csvShortUrl);
                const category = getCategoryForEp(realEpNum);
                const airDate = csvDate ? csvDate : extractRealDate(title, realEpNum);
                const image = videoId 
                    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                    : 'https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Episode';

                const durationText = csvDuration ? csvDuration : (realEpNum === 4778 ? '09:48' : '21:45');

                const monthLookup = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
                let pubDateStr = new Date().toISOString();
                if (airDate) {
                    const dateParts = airDate.split(/\s+/);
                    if (dateParts.length >= 3) {
                        let dayStr = dateParts[0].replace(/,/g, '');
                        let monthStr = dateParts[1].replace(/,/g, '');
                        if (isNaN(parseInt(dayStr, 10))) {
                            const temp = dayStr;
                            dayStr = monthStr;
                            monthStr = temp;
                        }
                        const day = parseInt(dayStr, 10);
                        const month = monthStr.substring(0, 3).toLowerCase();
                        const year = parseInt(dateParts[2], 10);
                        if (!isNaN(day) && monthLookup[month] !== undefined && !isNaN(year)) {
                            pubDateStr = new Date(Date.UTC(year, monthLookup[month], day)).toISOString();
                        }
                    }
                }

                articles.push({
                    id: `ep_${realEpNum}`,
                    epNumber: realEpNum,
                    title: title || `Episode ${realEpNum} - Taarak Mehta Ka Ooltah Chashmah`,
                    description: `Watch full single episode ${realEpNum} of Gokuldham Society adventures.`,
                    category: category,
                    source: 'SONY SAB',
                    url: url,
                    videoId: videoId,
                    fallbackId: fallbackId,
                    shortId: shortId,
                    image: image,
                    airDate: airDate,
                    durationText: durationText,
                    publishedAt: pubDateStr
                });
            }
        }

        return articles.sort((a, b) => b.epNumber - a.epNumber);

    } catch (error) {
        console.error("Could not fetch TMKOC dataset:", error);
        return [];
    }
}

export async function fetchStorylines() {
    try {
        const cacheBuster = Date.now(); // Force bypass CDN cache
        const response = await fetch(`data/storylines.json?t=${cacheBuster}`);
        if (!response.ok) return [];
        const data = await response.json();
        // Sort in decreasing order (newest storylines first)
        return data.sort((a, b) => b.startEp - a.startEp);
    } catch (e) {
        console.error("Could not fetch storylines dataset:", e);
        return [];
    }
}

export async function fetchStateLog() {
    try {
        const response = await fetch('data/state.json?t=' + Date.now());
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('Failed to fetch state log:', e);
        return null;
    }
}

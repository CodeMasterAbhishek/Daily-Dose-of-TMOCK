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
        const cacheBuster = Math.floor(Date.now() / 600000); // 10 minutes cache
        
        const response = await fetch(`data/episodes.json?t=${cacheBuster}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const db = await response.json();
        const articles = [];

        // Helper to format seconds to MM:SS
        const formatTime = (totalSeconds) => {
            if (!totalSeconds) return '21:45';
            const m = Math.floor(totalSeconds / 60);
            const s = totalSeconds % 60;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        for (const epKey in db) {
            const data = db[epKey];
            const realEpNum = data.epNumber;
            const category = getCategoryForEp(realEpNum);
            
            // Format AirDate
            const airDate = data.releaseDate || getAirDateForEp(realEpNum);
            let pubDateStr = new Date().toISOString();
            if (airDate) {
                // If it looks like YYYY-MM-DD
                if (airDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    pubDateStr = new Date(airDate).toISOString();
                } else {
                    const dateParts = airDate.split(/\s+/);
                    if (dateParts.length >= 3) {
                        const monthLookup = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
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
            }

            // Always use YouTube thumbnails (SonyLIV CDN blocks cross-origin browser requests)
            let image = data.yt_main
                ? `https://img.youtube.com/vi/${data.yt_main}/hqdefault.jpg`
                : 'https://via.placeholder.com/480x270/18181b/818cf8?text=TMKOC+Episode';

            // Description fallback
            const desc = data.description && data.description.trim() !== '' 
                         ? data.description 
                         : `Watch full single episode ${realEpNum} of Gokuldham Society adventures.`;

            articles.push({
                id: `ep_${realEpNum}`,
                epNumber: realEpNum,
                title: data.title || `Episode ${realEpNum} - Taarak Mehta Ka Ooltah Chashmah`,
                description: desc,
                category: category,
                source: 'SONY SAB',
                url: data.yt_main ? `https://www.youtube.com/watch?v=${data.yt_main}` : '',
                videoId: data.yt_main || '',
                robustFallbacks: data.yt_backups || [],
                robustShorts: data.yt_shorts || [],
                image: image,
                airDate: airDate,
                durationText: formatTime(data.durationSeconds),
                publishedAt: pubDateStr
            });
        }

        return articles.sort((a, b) => b.epNumber - a.epNumber);

    } catch (error) {
        console.error("Could not fetch TMKOC JSON dataset:", error);
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

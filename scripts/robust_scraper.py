import csv
import json
import time
import re
import sys
import os
import tempfile

try:
    import scrapetube
except ImportError:
    print("scrapetube not found. Please install it.")
    sys.exit(1)

# Import shared config to avoid drift (P2 #18)
try:
    from config import CSV_FILE, VALID_CHANNELS
    from utils import get_minutes
except ImportError:
    # Fallback for standalone execution outside scripts/
    CSV_FILE = 'data/episodes.csv'
    VALID_CHANNELS = [
        'sony sab', 'sony pal',
        'taarak mehta ka ooltah chashmah',
        'taarak mehta ka ooltah chashmah episodes',
        'taarak mehta ka ooltah chashmah movies',
        'liv comedy'
    ]
    def get_minutes(duration_str):
        try:
            parts = duration_str.split(':')
            if len(parts) == 3: return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 2: return int(parts[0])
        except (ValueError, TypeError, AttributeError):
            pass
        return 0

ROBUST_DB_FILE = 'data/robust_fallbacks.json'

def score_video(mins, channel):
    c = channel.lower()
    score = 0
    if c == 'sony sab': score += 50
    elif 'taarak mehta ka ooltah chashmah' in c: score += 40
    elif c == 'sony pal': score += 10
    return score + (mins if mins <= 55 else 0)

def search_robust(ep_num):
    queries = [
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}"
    ]
    
    found_videos = []
    seen_ids = set()
    
    for query in queries:
        try:
            videos = scrapetube.get_search(query, limit=15)
            for vid in videos:
                vid_id = vid.get('videoId')
                if not vid_id or vid_id in seen_ids: continue
                seen_ids.add(vid_id)
                
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                
                if channel.lower() not in VALID_CHANNELS:
                    continue
                    
                duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                mins = get_minutes(duration_str)
                
                # Verify episode number with word-boundary regex (P2 #12 fix)
                if not re.search(rf'\b0*{ep_num}\b', title):
                    continue
                    
                cat = "full" if mins >= 15 else ("short" if mins >= 8 else "skip")
                if cat == "skip": continue
                if mins > 55: continue # Compilation
                
                score = score_video(mins, channel)
                
                found_videos.append({
                    "id": vid_id,
                    "title": title,
                    "channel": channel,
                    "duration": duration_str,
                    "type": cat,
                    "score": score
                })
        except Exception as e:
            print(f"  [WARN] Search failed: {e}")

    found_videos.sort(key=lambda x: x['score'], reverse=True)
    
    result = {"full": [], "short": []}
    for v in found_videos:
        if v['type'] == 'full':
            result['full'].append(v)
        elif v['type'] == 'short':
            result['short'].append(v)
            
    return result

def atomic_json_write(filepath, data):
    """Write JSON atomically via tempfile to prevent corruption on crash (P1 #11)."""
    dir_name = os.path.dirname(filepath) or "."
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=dir_name, suffix='.tmp', delete=False, encoding='utf-8') as tmp:
            json.dump(data, tmp, indent=2)
            tmp_path = tmp.name
        os.replace(tmp_path, filepath)
    except Exception as e:
        print(f"[WARN] Atomic write failed ({e}), falling back to direct write")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

def main():
    print("Starting robust local scraper for all episodes...")
    
    db = {}
    if os.path.exists(ROBUST_DB_FILE):
        try:
            with open(ROBUST_DB_FILE, 'r', encoding='utf-8') as f:
                db = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"[WARN] Could not load existing fallback DB: {e}. Starting fresh.")
            db = {}

    # Read all episodes from CSV to know max episodes
    episodes = []
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if row:
                try:
                    episodes.append(int(row[0]))
                except ValueError:
                    continue
            
    episodes.sort(reverse=True) # Scrape newest first
    
    total_episodes_processed = 0
    total_full_found = 0
    total_short_found = 0
    
    for ep in episodes:
        if str(ep) in db:
            continue # Skip already processed
            
        print(f"Scraping robust fallbacks for Episode {ep}...", end=" ")
        res = search_robust(ep)
        
        f_len = len(res['full'])
        s_len = len(res['short'])
        total_episodes_processed += 1
        total_full_found += f_len
        total_short_found += s_len
        
        print(f"Found {f_len} full, {s_len} short videos.")
        
        db[str(ep)] = res
        
        # Save every 5 processed episodes (P3 #37 fix — count-based, not ep-number-based)
        if total_episodes_processed % 5 == 0:
            atomic_json_write(ROBUST_DB_FILE, db)
                
        time.sleep(1) # Prevent aggressive rate limits

    atomic_json_write(ROBUST_DB_FILE, db)
    print(f"Scraping complete. Processed {total_episodes_processed} episodes. Found {total_full_found} full, {total_short_found} short videos.")

if __name__ == '__main__':
    main()

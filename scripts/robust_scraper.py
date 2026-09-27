import csv
import json
import time
import urllib.request
import re
import sys
import os

try:
    import scrapetube
except ImportError:
    print("scrapetube not found. Please install it.")
    sys.exit(1)

CSV_FILE = 'data/episodes.csv'
ROBUST_DB_FILE = 'data/robust_fallbacks.json'

VALID_CHANNELS = [
    'sony sab', 
    'sony pal', 
    'taarak mehta ka ooltah chashmah', 
    'taarak mehta ka ooltah chashmah episodes',
    'taarak mehta ka ooltah chashmah movies',
    'liv comedy'
]

def get_minutes(duration_str: str) -> int:
    parts = duration_str.split(':')
    if len(parts) == 3: return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 2: return int(parts[0])
    return 0

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
                
                # Verify episode number is in title
                if str(ep_num) not in title:
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
            pass

    found_videos.sort(key=lambda x: x['score'], reverse=True)
    
    result = {"full": [], "short": []}
    for v in found_videos:
        if v['type'] == 'full':
            result['full'].append(v)
        elif v['type'] == 'short':
            result['short'].append(v)
            
    return result

def main():
    print("Starting robust local scraper for all episodes...")
    
    db = {}
    if os.path.exists(ROBUST_DB_FILE):
        try:
            with open(ROBUST_DB_FILE, 'r') as f:
                db = json.load(f)
        except: pass

    # Read all episodes from CSV to know max episodes
    episodes = []
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if row: episodes.append(int(row[0]))
            
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
        
        # Save every 5 episodes
        if ep % 5 == 0:
            with open(ROBUST_DB_FILE, 'w') as f:
                json.dump(db, f, indent=2)
                
        time.sleep(1) # Prevent aggressive rate limits

    with open(ROBUST_DB_FILE, 'w') as f:
        json.dump(db, f, indent=2)
    print("Scraping complete.")

if __name__ == '__main__':
    main()

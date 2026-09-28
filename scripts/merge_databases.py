import csv
import json
import os
import re
import shutil

def extract_id(url):
    if not url: return None
    match = re.search(r'(?:v=|youtu\.be/|/v/|/embed/)([^&?]+)', url)
    return match.group(1) if match else None

def parse_time(time_str):
    try:
        parts = str(time_str).split(':')
        if len(parts) == 3: return int(parts[0])*3600 + int(parts[1])*60 + int(parts[2])
        if len(parts) == 2: return int(parts[0])*60 + int(parts[1])
    except:
        pass
    return 0

def merge():
    # Import from config
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from config import CSV_FILE, JSON_DB_FILE, BASE_DIR
    
    csv_file = CSV_FILE
    sony_file = os.path.join(BASE_DIR, 'data', 'archive', 'sonyliv_episodes.json')
    out_file = JSON_DB_FILE
    
    if not os.path.exists(sony_file):
        print(f"Warning: {sony_file} not found. Skipping merge.")
        return
        
    with open(sony_file, 'r', encoding='utf-8') as f:
        sony_db = json.load(f)
        
    master_db = {}
    
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ep = row.get('Episode')
            if not ep: continue
            
            main_id = extract_id(row.get('URL'))
            fallback_id = extract_id(row.get('FallbackURL'))
            short_id = extract_id(row.get('ShortURL'))
            
            backups = []
            if fallback_id and fallback_id != main_id:
                backups.append(fallback_id)
                
            shorts = []
            if short_id and short_id != main_id and short_id != fallback_id:
                shorts.append(short_id)
                
            sony_data = sony_db.get(ep, {})
            
            duration_s = sony_data.get('duration_seconds')
            if not duration_s:
                duration_s = parse_time(row.get('Duration'))
                
            # Try to grab a thumbnail from SonyLIV's raw JSON dump
            thumbnail = ""
            if "raw_data" in sony_data:
                raw_str = json.dumps(sony_data['raw_data'])
                img_match = re.search(r'https://[^"]+\.jpg', raw_str)
                if img_match:
                    thumbnail = img_match.group(0)
            
            master_db[ep] = {
                "epNumber": int(ep),
                "title": sony_data.get('title') or row.get('Title', f"Episode {ep}"),
                "description": sony_data.get('description', ''),
                "releaseDate": sony_data.get('release_date') or row.get('Date', ''),
                "durationSeconds": int(duration_s) if duration_s else 0,
                "thumbnail": thumbnail,
                "yt_main": main_id,
                "yt_backups": backups,
                "yt_shorts": shorts,
                "status": row.get('Status', 'Found')
            }
            
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(master_db, f, separators=(',', ':'), ensure_ascii=False)
        
    print(f"Merged {len(master_db)} episodes into {out_file}!")

if __name__ == "__main__":
    merge()
